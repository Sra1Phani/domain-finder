// Pure mapping: a checked name's per-surface state → the Name Detail view's
// rows. Real fields only — a CTA is emitted only when it has a real
// destination, and the acquirability treatment renders only when data is
// present (null = absent), the same forward-slot pattern as the trademark
// panel. No fabricated prices/for-sale/premium.

import type { SurfaceState } from "./check-stream";
import type { UiStatus } from "./ui/status";
import { buyUrl, whoisUrl } from "./links";

export type DetailCta = { label: string; href: string };

/** Acquirability slot — a visually distinct treatment, present only when known. */
export type DetailAcquire =
  | { kind: "restricted" }
  | { kind: "premium" }
  | { kind: "forSale"; price: number | null; href: string | null };

export type DetailRow = {
  surface: string;
  type: "domain" | "registry";
  label: string;
  status: UiStatus;
  meta: string;
  cta: DetailCta | null;
  acquire: DetailAcquire | null;
};

function ctaFor(s: SurfaceState): DetailCta | null {
  if (s.type === "domain") {
    if (s.status === "available") return { label: `Register ${s.surface}`, href: buyUrl(s.surface) };
    if (s.status === "taken" || s.status === "parked") return { label: "WHOIS", href: whoisUrl(s.surface) };
    return null; // unknown / invalid — nothing real to link to
  }
  // registry: only when the stream gave us a real URL (e.g. a taken profile)
  if (s.url) return { label: s.status === "available" ? "View namespace" : "Open profile", href: s.url };
  return null;
}

/** The acquire treatment, chosen from whatever real data is present (else null). */
function acquireFor(s: SurfaceState): DetailAcquire | null {
  if (s.restricted === true) return { kind: "restricted" };
  const a = s.acquire;
  if (a) {
    if (a.forSale && (a.price != null || a.buyUrl)) {
      return { kind: "forSale", price: a.price ?? null, href: a.buyUrl ?? null };
    }
    if (a.premium) return { kind: "premium" };
  }
  return null;
}

/** The domain a "Watch" affordance should monitor: the first taken/parked
 * domain surface, preferring .com. Watches are domain-only, so a name whose
 * domains are all free (only a registry is taken) has no watch target. */
export function watchTargetOf(
  surfaces: Pick<SurfaceState, "surface" | "type" | "status">[],
): { domain: string; status: string } | null {
  const domains = surfaces.filter(
    (s) => s.type === "domain" && (s.status === "taken" || s.status === "parked"),
  );
  if (domains.length === 0) return null;
  const pick = domains.find((d) => d.surface.endsWith(".com")) ?? domains[0];
  return { domain: pick.surface, status: pick.status };
}

export function toDetailRows(surfaces: SurfaceState[]): DetailRow[] {
  return surfaces.map((s) => ({
    surface: s.surface,
    type: s.type,
    label: s.label,
    status: s.status,
    meta: s.status === "checking" ? "checking…" : s.meta ?? "—",
    cta: ctaFor(s),
    acquire: acquireFor(s),
  }));
}
