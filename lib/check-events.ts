// UI-facing contract for the streaming Check API. This is a SURFACE concern —
// it lives in the app, not core — and is deliberately decoupled from raw core
// types so the frontend has a stable shape to build against.
//
// Forward slots (acquire, restricted) are present in the type but null now:
// acquirability (premium/for-sale/price/buy) and domain restrictions aren't
// wired yet, but the contract carries them so Stage 3+ doesn't have to reopen it.

import type {
  AvailabilityStatus,
  BrandOptions,
  BrandStreamEvent,
  Core,
  NamespaceStatus,
  Surface,
} from "@domain-finder/core";
import { isRestrictedTld } from "@domain-finder/core";

export type CheckStatus = "available" | "taken" | "parked" | "unknown" | "invalid";

/** Forward slot — acquirability. All fields null until the acquire path is wired. */
export type CheckAcquire = {
  premium?: boolean | null;
  forSale?: boolean | null;
  price?: number | null;
  buyUrl?: string | null;
};

export type CheckSurfaceEvent = {
  kind: "result";
  /** domain vs registry (github/npm/pypi) — how the UI groups it */
  type: "domain" | "registry";
  /** stable surface id, e.g. "acme.com" or "github" */
  surface: string;
  /** human display label, e.g. "acme.com" or "GitHub" */
  label: string;
  status: CheckStatus;
  tld?: string | null;
  url?: string | null;
  expiry?: string | null;
  /** domains only; null until restriction data is wired */
  restricted?: boolean | null;
  /** forward slot; null until acquirability is wired */
  acquire?: CheckAcquire | null;
};

/** Mirrors streamBrand's init/result/summary, plus a structured error. */
export type CheckEvent =
  | { kind: "init"; surfaces: string[] }
  | CheckSurfaceEvent
  | { kind: "summary"; allClear: boolean; takenOn: string[] }
  | { kind: "error"; message: string };

// --- pure mapping: core stream event -> CheckEvent ---------------------------

const REGISTRY_LABEL: Record<Surface, string> = {
  github: "GitHub",
  npm: "npm",
  pypi: "PyPI",
};

/** Domain availability -> the UI's coarser status. Never invents "available". */
function domainStatus(s: AvailabilityStatus): CheckStatus {
  switch (s) {
    case "available":
      return "available";
    case "parked":
      return "parked";
    case "unknown":
      return "unknown";
    // active/reserved/expiring/deleting are all "not free to register now".
    case "active":
    case "reserved":
    case "expiring":
    case "deleting":
      return "taken";
  }
}

/** Namespace status maps 1:1 — available/taken/invalid/unknown are all CheckStatus. */
function namespaceStatus(s: NamespaceStatus): CheckStatus {
  return s;
}

function tldOf(domain: string): string | null {
  const dot = domain.indexOf(".");
  return dot >= 0 ? domain.slice(dot) : null;
}

export function toCheckEvent(event: BrandStreamEvent): CheckEvent {
  if (event.kind === "init") return { kind: "init", surfaces: event.surfaces };
  if (event.kind === "summary")
    return { kind: "summary", allClear: event.allClear, takenOn: event.takenOn };

  // result
  if (event.type === "domain") {
    const r = event.result;
    const tld = tldOf(event.surface);
    return {
      kind: "result",
      type: "domain",
      surface: event.surface,
      label: event.surface,
      status: domainStatus(r.status),
      tld,
      url: null,
      expiry: r.expiresAt ?? null,
      // Tier-1 acquirability: brand-operated/restricted TLDs can't be registered
      // even when they read as available. Everything else stays null (unknown).
      restricted: tld ? isRestrictedTld(tld) : null,
      acquire: null, // forward slot — premium/for-sale/price not wired
    };
  }

  const r = event.result;
  return {
    kind: "result",
    type: "registry",
    surface: event.surface,
    label: REGISTRY_LABEL[r.surface] ?? event.surface,
    status: namespaceStatus(r.status),
    tld: null,
    url: r.url ?? null,
    expiry: null,
    restricted: null,
    acquire: null, // forward slot
  };
}

// --- testable producer -------------------------------------------------------

const VALID_SURFACES: Surface[] = ["github", "npm", "pypi"];

type CheckInput = { name?: unknown; tlds?: unknown; surfaces?: unknown };

/**
 * Validate input, then drive core.streamBrand and map each event to a CheckEvent.
 * On bad input, yields a single structured error event (never throws / crashes
 * the stream). Typed against just the streamBrand slice of Core so tests can
 * pass a minimal fake.
 */
export async function* streamCheck(
  core: Pick<Core, "streamBrand">,
  input: CheckInput,
): AsyncGenerator<CheckEvent> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    yield { kind: "error", message: "A 'name' (non-empty string) is required." };
    return;
  }

  const opts: BrandOptions = {};
  if (Array.isArray(input.tlds)) {
    const tlds = input.tlds.filter((t): t is string => typeof t === "string");
    if (tlds.length) opts.tlds = tlds;
  }
  if (Array.isArray(input.surfaces)) {
    const surfaces = input.surfaces.filter((s): s is Surface =>
      VALID_SURFACES.includes(s as Surface),
    );
    if (surfaces.length) opts.surfaces = surfaces;
  }

  for await (const event of core.streamBrand(name, opts)) {
    yield toCheckEvent(event);
  }
}
