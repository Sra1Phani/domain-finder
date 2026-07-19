// checkBrand — compose the domain check and the cross-namespace check into one
// call, so every surface (MCP now, REST later) fans out the same way instead of
// re-implementing it. Purely additive: it orchestrates the existing domain and
// namespace paths and touches neither AvailabilityResult, NamespaceResult, nor
// search().

import type { AvailabilityResult, NamespaceResult, Surface } from "./types";
import { streamSettled } from "./pool";

/** Domain TLDs (no leading dot) checked by default for a brand. */
export const DEFAULT_BRAND_TLDS = ["com", "io", "dev", "app", "ai"];
export const DEFAULT_BRAND_SURFACES: Surface[] = ["github", "npm", "pypi"];

// Shared fan-out shape, so checkBrand and streamBrand agree on what gets checked.
function resolveTlds(opts: BrandOptions): string[] {
  return opts.tlds?.length ? opts.tlds : DEFAULT_BRAND_TLDS;
}
function resolveSurfaces(opts: BrandOptions): Surface[] {
  return opts.surfaces?.length ? opts.surfaces : DEFAULT_BRAND_SURFACES;
}
/** Build the concrete domain names for a brand: name + each TLD (dot optional). */
export function brandDomainNames(name: string, tlds: string[]): string[] {
  return tlds.map((tld) => `${name}.${tld.replace(/^\./, "")}`);
}

/**
 * The brand-level summary — computed identically for the composite and the
 * stream. "unknown"/"invalid" are never counted as available: allClear requires
 * every surface CONFIRMED available; and only a definitively-taken surface lands
 * in takenOn (a domain that is neither available nor unknown; a namespace whose
 * status is exactly "taken").
 */
export function summarizeBrand(
  domains: AvailabilityResult[],
  namespaces: NamespaceResult[],
): { allClear: boolean; takenOn: string[] } {
  const takenOn: string[] = [];
  for (const d of domains) {
    if (d.status !== "available" && d.status !== "unknown") takenOn.push(d.domain);
  }
  for (const n of namespaces) {
    if (n.status === "taken") takenOn.push(n.surface);
  }
  const allClear =
    domains.every((d) => d.status === "available") &&
    namespaces.every((n) => n.status === "available");
  return { allClear, takenOn };
}

export type BrandOptions = {
  /** TLDs to check, with or without a leading dot. */
  tlds?: string[];
  surfaces?: Surface[];
};

export type BrandResult = {
  name: string;
  domains: AvailabilityResult[];
  namespaces: NamespaceResult[];
};

/**
 * The wired collaborators checkBrand fans out over. Both already use the bounded
 * worker pool internally (checkMany / checkNamespaces), so per-item concurrency
 * stays capped; the two sides run concurrently.
 */
export type BrandCtx = {
  checkDomains: (domains: string[]) => Promise<AvailabilityResult[]>;
  checkNamespaces: (name: string, surfaces: Surface[]) => Promise<NamespaceResult[]>;
};

export async function checkBrand(
  name: string,
  opts: BrandOptions,
  ctx: BrandCtx,
): Promise<BrandResult> {
  const domainNames = brandDomainNames(name, resolveTlds(opts));
  const surfaces = resolveSurfaces(opts);

  const [domains, namespaces] = await Promise.all([
    ctx.checkDomains(domainNames),
    ctx.checkNamespaces(name, surfaces),
  ]);

  return { name, domains, namespaces };
}

// --- streaming (completion-order) --------------------------------------------

/**
 * The wired per-item collaborators streamBrand fans out over. One check per
 * call (not batched) so each can be yielded the instant it settles.
 */
export type StreamBrandCtx = {
  checkDomain: (domain: string) => Promise<AvailabilityResult>;
  checkNamespace: (name: string, surface: Surface) => Promise<NamespaceResult>;
  /** bounded concurrency across the merged domain+namespace fan-out */
  concurrency?: number;
};

/** A single settled check, tagged so the consumer knows which kind it is. */
export type BrandResultEntry =
  | { type: "domain"; surface: string; result: AvailabilityResult }
  | { type: "namespace"; surface: string; result: NamespaceResult };

/**
 * Events emitted by streamBrand, in order:
 *   1. exactly one `init` listing every surface id to expect,
 *   2. one `result` per check, IN COMPLETION ORDER (fastest first),
 *   3. exactly one `summary`.
 */
export type BrandStreamEvent =
  | { kind: "init"; surfaces: string[] }
  | ({ kind: "result" } & BrandResultEntry)
  | { kind: "summary"; allClear: boolean; takenOn: string[] };

const DEFAULT_STREAM_CONCURRENCY = 6;

/**
 * The same fan-out checkBrand does, but streamed: yields each domain/namespace
 * result the moment it settles (completion order, not input order), then a final
 * summary. checkBrand is intentionally left separate — reimplementing it on this
 * would change its batched collaborator contract (its tests assert checkDomains
 * is called with the whole array), so the two share the fan-out *shape*
 * (brandDomainNames) and the summary rule (summarizeBrand) instead.
 */
export async function* streamBrand(
  name: string,
  opts: BrandOptions,
  ctx: StreamBrandCtx,
): AsyncGenerator<BrandStreamEvent> {
  const domainNames = brandDomainNames(name, resolveTlds(opts));
  const surfaces = resolveSurfaces(opts);

  yield { kind: "init", surfaces: [...domainNames, ...surfaces] };

  const thunks: Array<() => Promise<BrandResultEntry>> = [
    ...domainNames.map(
      (domain) => async (): Promise<BrandResultEntry> => ({
        type: "domain",
        surface: domain,
        result: await ctx.checkDomain(domain),
      }),
    ),
    ...surfaces.map(
      (surface) => async (): Promise<BrandResultEntry> => ({
        type: "namespace",
        surface,
        result: await ctx.checkNamespace(name, surface),
      }),
    ),
  ];

  const domains: AvailabilityResult[] = [];
  const namespaces: NamespaceResult[] = [];

  for await (const entry of streamSettled(
    thunks,
    ctx.concurrency ?? DEFAULT_STREAM_CONCURRENCY,
  )) {
    if (entry.type === "domain") domains.push(entry.result);
    else namespaces.push(entry.result);
    yield { kind: "result", ...entry };
  }

  const { allClear, takenOn } = summarizeBrand(domains, namespaces);
  yield { kind: "summary", allClear, takenOn };
}
