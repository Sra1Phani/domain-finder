// checkBrand — compose the domain check and the cross-namespace check into one
// call, so every surface (MCP now, REST later) fans out the same way instead of
// re-implementing it. Purely additive: it orchestrates the existing domain and
// namespace paths and touches neither AvailabilityResult, NamespaceResult, nor
// search().

import type { AvailabilityResult, NamespaceResult, Surface } from "./types";

/** Domain TLDs (no leading dot) checked by default for a brand. */
export const DEFAULT_BRAND_TLDS = ["com", "io", "dev", "app", "ai"];
export const DEFAULT_BRAND_SURFACES: Surface[] = ["github", "npm", "pypi"];

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
  const tlds = opts.tlds?.length ? opts.tlds : DEFAULT_BRAND_TLDS;
  const surfaces = opts.surfaces?.length ? opts.surfaces : DEFAULT_BRAND_SURFACES;

  const domainNames = tlds.map((tld) => `${name}.${tld.replace(/^\./, "")}`);

  const [domains, namespaces] = await Promise.all([
    ctx.checkDomains(domainNames),
    ctx.checkNamespaces(name, surfaces),
  ]);

  return { name, domains, namespaces };
}
