// Parse what the user typed (or a Generate candidate routed) into the Check
// flow. A bare name ("toolna") is checked across the selected TLDs. But a full
// domain ("toolna.me" — e.g. a domain-hack) must check THAT domain, not have
// more TLDs appended (which produced "toolna.me.com"). So we split a single-
// label domain into its stem plus TLD, and the caller adds that TLD to the set
// it checks — so the .me tile actually appears, and no double-TLD is built.

import { normalizeRegistrableTld, normalizeTld } from "./tld-input";

export function parseCheckInput(raw: string): { name: string; extraTlds: string[] } {
  const norm = raw.trim().toLowerCase().replace(/\s+/g, "-");
  const dot = norm.lastIndexOf(".");
  if (dot > 0) {
    const stem = norm.slice(0, dot);
    const suffix = norm.slice(dot);
    // Only split a clean single-label domain whose suffix looks like a TLD.
    if (stem.length > 0 && !stem.includes(".") && normalizeTld(suffix)) {
      // Add the TLD to the checked set only if it's openly registrable; a
      // restricted suffix (.map) is dropped rather than appended as ".map.com".
      const registrable = normalizeRegistrableTld(suffix);
      return { name: stem, extraTlds: registrable ? [registrable] : [] };
    }
  }
  return { name: norm, extraTlds: [] };
}
