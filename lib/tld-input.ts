// Normalize a user-typed TLD for the "+ add TLD" input. Forgiving about the
// leading dot and casing, and if someone pastes a whole domain we take the last
// dot-segment ("example.com" -> ".com"). Returns null for anything that isn't a
// plausible TLD (letters, 2+ chars, or an xn-- punycode label), so junk can't
// be added. Pure + unit-tested; the component owns the input state.

export function normalizeTld(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9.-]/g, "");
  const seg = cleaned.split(".").filter(Boolean).pop() ?? "";
  const isAscii = /^[a-z]{2,63}$/.test(seg);
  const isPuny = /^xn--[a-z0-9-]{1,59}$/.test(seg);
  if (!isAscii && !isPuny) return null;
  return "." + seg;
}
