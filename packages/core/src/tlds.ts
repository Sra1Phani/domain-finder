// TLD catalogue with a desirability weight used by the ranker.
// Weight is a 0–1 multiplier on the TLD-quality component of the score.

export type TldInfo = {
  tld: string; // includes leading dot
  weight: number;
  note?: string;
};

export const TLDS: TldInfo[] = [
  { tld: ".com", weight: 1.0, note: "the default; most trusted" },
  { tld: ".io", weight: 0.85, note: "popular with tech/startups" },
  { tld: ".ai", weight: 0.85, note: "AI products" },
  { tld: ".co", weight: 0.75, note: "short .com alternative" },
  { tld: ".app", weight: 0.7, note: "apps; HTTPS-enforced" },
  { tld: ".dev", weight: 0.65, note: "developer tools" },
  { tld: ".net", weight: 0.6 },
  { tld: ".org", weight: 0.6, note: "non-profits/communities" },
  { tld: ".xyz", weight: 0.45, note: "cheap, generic" },
  { tld: ".me", weight: 0.45, note: "personal brands" },
];

/** Default set searched when the caller doesn't specify TLDs. */
export const DEFAULT_TLDS = [".com", ".io", ".ai", ".co", ".app"];

const WEIGHTS = new Map(TLDS.map((t) => [t.tld, t.weight]));

export function tldWeight(tld: string): number {
  return WEIGHTS.get(tld.toLowerCase()) ?? 0.4;
}

// Tier-1 acquirability: a static list of TLDs that are brand-operated or
// otherwise not open for general registration. A name can read as "available"
// on RDAP-style checks yet be impossible to actually register here — flagging
// it fixes the "reads nice, can't get it" case. This is a curated static set,
// not an exhaustive registry; pricing/aftermarket data stays a null slot.
export const RESTRICTED_TLDS: readonly string[] = [
  ".gov",
  ".mil",
  ".int",
  ".edu",
  ".google",
  ".gle",
  ".aws",
  ".amazon",
  ".apple",
  ".microsoft",
  ".map", // Google-operated brand TLD
];

const RESTRICTED_SET = new Set(RESTRICTED_TLDS);

/** Whether a TLD is brand-operated/restricted (leading dot optional). */
export function isRestrictedTld(tld: string): boolean {
  const t = tld.toLowerCase();
  return RESTRICTED_SET.has(t.startsWith(".") ? t : `.${t}`);
}
