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

// Restricted-TLD data (RESTRICTED_TLDS / isRestrictedTld) now lives in
// tld-context.ts — the single source of truth reconciled with the rich TLD
// context — so the picker's exclusion and the Detail view can't drift apart.
