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
