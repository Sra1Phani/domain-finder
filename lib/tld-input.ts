// Normalize a user-typed TLD for the "+ add TLD" input. Forgiving about the
// leading dot and casing, and if someone pastes a whole domain we take the last
// dot-segment ("example.com" -> ".com"). Returns null for anything that isn't a
// plausible TLD (letters, 2+ chars, or an xn-- punycode label), so junk can't
// be added. Pure + unit-tested; the component owns the input state.

import { isRestrictedTld } from "@domain-finder/core";

export function normalizeTld(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9.-]/g, "");
  const seg = cleaned.split(".").filter(Boolean).pop() ?? "";
  const isAscii = /^[a-z]{2,63}$/.test(seg);
  const isPuny = /^xn--[a-z0-9-]{1,59}$/.test(seg);
  if (!isAscii && !isPuny) return null;
  return "." + seg;
}

/** Keep only openly-registrable TLDs — drop brand-operated/restricted ones so
 * the picker never offers a TLD you can't actually register. */
export function registrableTlds(tlds: string[]): string[] {
  return tlds.filter((t) => !isRestrictedTld(t));
}

/** A normalized TLD that is also openly registrable, or null. Used by the
 * custom-add input so a user can't add a restricted TLD (e.g. .map, .gov). */
export function normalizeRegistrableTld(raw: string): string | null {
  const tld = normalizeTld(raw);
  return tld && !isRestrictedTld(tld) ? tld : null;
}
