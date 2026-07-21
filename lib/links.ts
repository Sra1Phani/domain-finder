// Outbound hand-off links. Shared by the results UI and the alert emails, so
// swapping in affiliate links is a one-line change in one place.

/** Registrar search for a domain you can register right now. */
export function buyUrl(domain: string): string {
  return `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(
    domain,
  )}`;
}

/**
 * Dropping domains can't be registered directly — they need a backorder. This
 * hand-off is the product: you cannot win a drop by polling, because
 * professional drop-catchers hold hundreds of registrar connections.
 */
export function backorderUrl(domain: string): string {
  return `https://www.dropcatch.com/domain/${encodeURIComponent(domain)}`;
}

/** Public WHOIS lookup for a taken/parked domain — informational, not a sale. */
export function whoisUrl(domain: string): string {
  return `https://www.whois.com/whois/${encodeURIComponent(domain)}`;
}

// --- multi-registrar register links ------------------------------------------
// A neutral row of "register this domain here" options for an available domain.
// Each registrar is a real per-domain search/register deep link plus an EMPTY
// affiliate slot — set `affiliate` later (after signing up to each program) and
// the built URL carries the param and flips `affiliate` true so the UI shows a
// disclosure. We do NOT show prices (no pricing API) and never fabricate any.
//
// Only registrars with a known, working per-domain deep link are listed.
// Cloudflare Registrar is intentionally omitted: it has no public per-domain
// register URL (you register through the dashboard for domains already on
// Cloudflare), so a link would be misleading. Add it once that changes.

type RegistrarDef = {
  id: string;
  name: string;
  /** full per-domain search/register URL, WITHOUT any affiliate param */
  base: (domain: string) => string;
  /** empty for now; { param, value } once an affiliate program is joined */
  affiliate?: { param: string; value: string };
};

const enc = encodeURIComponent;

// Ordered NEUTRALLY (alphabetical) — no prices to rank by yet, and order must
// not imply commission. Reorder by price (user-first) only once real pricing
// lands (tier-2).
const REGISTRARS: RegistrarDef[] = [
  { id: "dynadot", name: "Dynadot", base: (d) => `https://www.dynadot.com/domain/search?domain=${enc(d)}` },
  { id: "godaddy", name: "GoDaddy", base: (d) => `https://www.godaddy.com/domainsearch/find?domainToCheck=${enc(d)}` },
  { id: "namecheap", name: "Namecheap", base: (d) => `https://www.namecheap.com/domains/registration/results/?domain=${enc(d)}` },
  { id: "porkbun", name: "Porkbun", base: (d) => `https://porkbun.com/checkout/search?q=${enc(d)}` },
];

export type RegistrarLink = {
  id: string;
  name: string;
  url: string;
  /** true when an affiliate param is attached (drives the disclosure) */
  affiliate: boolean;
};

/** Build the register links for a domain, in neutral order. */
export function registrarLinks(domain: string): RegistrarLink[] {
  return REGISTRARS.map((r) => {
    const base = r.base(domain);
    if (!r.affiliate) return { id: r.id, name: r.name, url: base, affiliate: false };
    const sep = base.includes("?") ? "&" : "?";
    return {
      id: r.id,
      name: r.name,
      url: `${base}${sep}${r.affiliate.param}=${enc(r.affiliate.value)}`,
      affiliate: true,
    };
  });
}

/** Whether any link carries an affiliate param — the UI shows the disclosure
 * only when this is true. */
export function hasAffiliateLinks(links: RegistrarLink[]): boolean {
  return links.some((l) => l.affiliate);
}
