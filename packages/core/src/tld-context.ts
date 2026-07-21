// Hybrid TLD-context dataset: hand-curated rich context for the TLDs people
// actually check, plus a thin auto-derived fallback so getTldContext ALWAYS
// returns something usable.
//
// This module is also the SINGLE SOURCE OF TRUTH for "is a TLD restricted":
// isRestrictedTld / RESTRICTED_TLDS derive from the `registrable` field here, so
// the picker's restricted-exclusion and the Detail view's context can't drift.
//
// ACCURACY: the curated notes are editorial product copy and assert only
// DURABLE, well-established facts. priceBand is a ROUGH tier, never a live price.
// Anything volatile (exact prices, "will be discontinued") is phrased as
// uncertainty or left out. These notes want a human review before shipping.
//
// Boundary: pure data + lookup — no imports, no env, no I/O.

/** Whether the public can register the TLD at all. Supersedes the old binary
 * restricted flag. "restricted" = registrable only if you meet an eligibility
 * requirement; "brand" = operated by a company, not open to anyone. */
export type Registrable = "open" | "restricted" | "brand";
export type TldKind = "gTLD" | "ccTLD" | "sponsored" | "brand";
/** ROUGH price tier, NOT a live price. "$" cheap … "$$$$" very expensive. */
export type PriceBand = "$" | "$$" | "$$$" | "$$$$";

export type TldContext = {
  /** with leading dot, lowercased */
  tld: string;
  registrable: Registrable;
  kind: TldKind;
  /** eligibility requirement, when restricted/brand */
  restriction?: string;
  /** who/what it signals — audience, vibe */
  connotation?: string;
  pros?: string[];
  cons?: string[];
  /** the one key warning */
  gotcha?: string;
  priceBand?: PriceBand;
  /** true = hand-authored; false = auto-derived fallback */
  curated: boolean;
};

type Curated = Omit<TldContext, "tld" | "curated">;

// --- curated set -------------------------------------------------------------
// ~40 TLDs. Keyed with the leading dot. EDITORIAL — needs human review.
const CURATED: Record<string, Curated> = {
  ".com": {
    registrable: "open",
    kind: "gTLD",
    connotation: "the default — universally understood, still the strongest trust signal",
    pros: ["most trusted", "best recall", "assumed by default"],
    cons: ["short, good names are long gone"],
    gotcha: "the good ones are usually taken.",
    priceBand: "$",
  },
  ".net": {
    registrable: "open",
    kind: "gTLD",
    connotation: "networks/infrastructure; the classic .com alternative",
    pros: ["widely recognized", "inexpensive"],
    cons: ["reads as a second choice to .com"],
    priceBand: "$",
  },
  ".org": {
    registrable: "open",
    kind: "gTLD",
    connotation: "non-profits, communities, open-source projects",
    pros: ["trusted for orgs and OSS"],
    cons: ["can feel off for a for-profit product"],
    priceBand: "$",
  },
  ".io": {
    registrable: "open",
    kind: "ccTLD",
    connotation: "startups, developer tools, APIs — strong tech cachet",
    pros: ["reads as modern/tech", "widely accepted for products"],
    cons: ["pricier than .com", "it's a ccTLD, so registry governance is outside your control"],
    gotcha:
      "a ccTLD (British Indian Ocean Territory), not a true gTLD; its long-term status has been questioned — treat as some uncertainty, not a prediction.",
    priceBand: "$$$",
  },
  ".ai": {
    registrable: "open",
    kind: "ccTLD",
    connotation: "AI/ML products — currently the strongest AI signal",
    pros: ["on-trend, unmistakable AI association"],
    cons: ["notably higher registration/renewal cost than .com"],
    gotcha: "a ccTLD (Anguilla); historically sold with a two-year minimum registration.",
    priceBand: "$$$",
  },
  ".co": {
    registrable: "open",
    kind: "ccTLD",
    connotation: "companies/startups; a short .com alternative marketed globally",
    pros: ["short", "startup-friendly", "widely available"],
    cons: ["confused with .com"],
    gotcha: "easily mistyped as .com — you'll lose some direct traffic.",
    priceBand: "$$",
  },
  ".app": {
    registrable: "open",
    kind: "gTLD",
    connotation: "apps and mobile products (Google-operated)",
    pros: ["clear product signal", "HTTPS enforced (on the HSTS preload list)"],
    cons: ["must serve over HTTPS — no plain HTTP"],
    gotcha: "HTTPS is mandatory; you can't serve it over http://.",
    priceBand: "$$",
  },
  ".dev": {
    registrable: "open",
    kind: "gTLD",
    connotation: "developer tools, docs, personal dev sites (Google-operated)",
    pros: ["clean developer signal", "HTTPS enforced (HSTS preload list)"],
    cons: ["must serve over HTTPS"],
    gotcha: "HTTPS is mandatory (HSTS preload) — no plain HTTP.",
    priceBand: "$",
  },
  ".xyz": {
    registrable: "open",
    kind: "gTLD",
    connotation: "generic, cheap, web3-adjacent",
    pros: ["very cheap", "lots of names available"],
    cons: ["weak trust signal", "some spam-filter association"],
    priceBand: "$",
  },
  ".tech": {
    registrable: "open",
    kind: "gTLD",
    connotation: "technology brands and events",
    pros: ["explicit tech signal"],
    cons: ["longer", "pricier than legacy gTLDs"],
    priceBand: "$$",
  },
  ".cloud": {
    registrable: "open",
    kind: "gTLD",
    connotation: "cloud, infrastructure, SaaS",
    pros: ["clear infra signal"],
    cons: ["longer to type"],
    priceBand: "$$",
  },
  ".info": {
    registrable: "open",
    kind: "gTLD",
    connotation: "informational sites",
    pros: ["cheap", "plentiful"],
    cons: ["dated", "heavy spam association"],
    priceBand: "$",
  },
  ".biz": {
    registrable: "open",
    kind: "gTLD",
    connotation: "business sites",
    cons: ["dated", "reads as a .com afterthought"],
    priceBand: "$",
  },
  ".online": { registrable: "open", kind: "gTLD", connotation: "generic web presence", cons: ["weak signal"], priceBand: "$" },
  ".site": { registrable: "open", kind: "gTLD", connotation: "generic web presence", cons: ["weak signal"], priceBand: "$" },
  ".store": { registrable: "open", kind: "gTLD", connotation: "e-commerce, shops", pros: ["clear retail signal"], priceBand: "$$" },
  ".space": { registrable: "open", kind: "gTLD", connotation: "creative/generic", cons: ["weak signal"], priceBand: "$" },
  ".me": {
    registrable: "open",
    kind: "ccTLD",
    connotation: "personal brands, portfolios, profiles (Montenegro, marketed for 'me')",
    pros: ["personal, pithy phrasing (about.me)"],
    cons: ["less businessy", "it's a ccTLD"],
    priceBand: "$$",
  },
  ".sh": {
    registrable: "open",
    kind: "ccTLD",
    connotation: "shell/scripts, CLI and developer tools (Saint Helena)",
    pros: ["clever dev pun (.sh)"],
    cons: ["obscure ccTLD", "pricier"],
    priceBand: "$$",
  },
  ".gg": {
    registrable: "open",
    kind: "ccTLD",
    connotation: "gaming and esports ('gg') (Guernsey)",
    pros: ["instantly reads as gaming"],
    cons: ["niche", "expensive"],
    priceBand: "$$$",
  },
  ".tv": {
    registrable: "open",
    kind: "ccTLD",
    connotation: "video, streaming, TV (Tuvalu)",
    pros: ["clear video/streaming signal"],
    cons: ["expensive", "ccTLD"],
    priceBand: "$$$",
  },
  ".fm": {
    registrable: "open",
    kind: "ccTLD",
    connotation: "audio, radio, podcasts (Micronesia)",
    pros: ["clear audio signal"],
    cons: ["expensive", "ccTLD"],
    priceBand: "$$$",
  },
  ".to": {
    registrable: "open",
    kind: "ccTLD",
    connotation: "'…to' phrasing and URL shorteners (Tonga)",
    cons: ["expensive", "no public WHOIS"],
    priceBand: "$$$",
  },
  ".ly": {
    registrable: "open",
    kind: "ccTLD",
    connotation: "'-ly' word hacks like bit.ly (Libya)",
    cons: ["ccTLD with content-policy risk"],
    gotcha: "the Libyan registry has, in the past, revoked names it judged against local law.",
    priceBand: "$$$",
  },
  ".es": {
    registrable: "open",
    kind: "ccTLD",
    connotation: "Spain, or '-es' word hacks (recip.es)",
    pros: ["Spanish-market targeting", "cheap"],
    priceBand: "$",
  },
  ".in": {
    registrable: "open",
    kind: "ccTLD",
    connotation: "India, or the word 'in' (registrable globally)",
    pros: ["India targeting", "short"],
    priceBand: "$",
  },
  ".uk": {
    registrable: "open",
    kind: "ccTLD",
    connotation: "United Kingdom",
    pros: ["UK-market targeting"],
    cons: ["needs a valid contact address on file"],
    priceBand: "$",
  },
  ".us": {
    registrable: "restricted",
    kind: "ccTLD",
    restriction: "requires a US presence (the 'US Nexus' — a US citizen, resident, or organization).",
    connotation: "United States",
    priceBand: "$",
  },
  ".ca": {
    registrable: "restricted",
    kind: "ccTLD",
    restriction: "requires a Canadian presence (CIRA Canadian Presence Requirements).",
    connotation: "Canada",
    priceBand: "$$",
  },
  ".eu": {
    registrable: "restricted",
    kind: "ccTLD",
    restriction: "requires residence or establishment in the EU/EEA.",
    connotation: "European Union",
    priceBand: "$",
  },
  ".th": {
    registrable: "restricted",
    kind: "ccTLD",
    restriction:
      "requires a Thai presence, or a matching trademark plus a local representative; foreigners typically register via an expensive trustee service.",
    connotation: "Thailand targeting",
    priceBand: "$$$$",
  },
  ".gov": {
    registrable: "restricted",
    kind: "sponsored",
    restriction: "US government entities only.",
    connotation: "US government",
  },
  ".edu": {
    registrable: "restricted",
    kind: "sponsored",
    restriction: "US-accredited postsecondary institutions only.",
    connotation: "US higher education",
  },
  ".mil": {
    registrable: "restricted",
    kind: "sponsored",
    restriction: "US military only.",
    connotation: "US military",
  },
  ".int": {
    registrable: "restricted",
    kind: "sponsored",
    restriction: "international organizations established by treaty only.",
    connotation: "international treaty organizations",
  },
  // Brand TLDs — operated by a single company, not open to the public.
  ".google": { registrable: "brand", kind: "brand", restriction: "operated by Google — not open for public registration.", connotation: "Google" },
  ".gle": { registrable: "brand", kind: "brand", restriction: "operated by Google — not open for public registration.", connotation: "Google (goo.gle)" },
  ".map": { registrable: "brand", kind: "brand", restriction: "operated by Google — not open for public registration.", connotation: "Google Maps" },
  ".aws": { registrable: "brand", kind: "brand", restriction: "operated by Amazon — not open for public registration.", connotation: "Amazon Web Services" },
  ".amazon": { registrable: "brand", kind: "brand", restriction: "operated by Amazon — not open for public registration.", connotation: "Amazon" },
  ".apple": { registrable: "brand", kind: "brand", restriction: "operated by Apple — not open for public registration.", connotation: "Apple" },
  ".microsoft": { registrable: "brand", kind: "brand", restriction: "operated by Microsoft — not open for public registration.", connotation: "Microsoft" },
};

// --- lookup ------------------------------------------------------------------

function normalize(tld: string): string {
  const t = tld.trim().toLowerCase();
  return t.startsWith(".") ? t : `.${t}`;
}

/** Curated rich context when known, else a thin non-blank fallback. Always
 * returns a usable TldContext. */
export function getTldContext(tldRaw: string): TldContext {
  const tld = normalize(tldRaw);
  const curated = CURATED[tld];
  if (curated) return { tld, curated: true, ...curated };

  // Fallback: unknown TLD. We can still classify registrability (from the
  // curated restricted set — anything not listed is treated as open, which is
  // the honest default) and guess kind from a ccTLD heuristic. No price band:
  // we don't know it, and we won't fabricate one.
  const bare = tld.slice(1);
  const kind: TldKind = /^[a-z]{2}$/.test(bare) ? "ccTLD" : "gTLD";
  return { tld, registrable: "open", kind, curated: false };
}

// --- reconciled restricted source (single source of truth) -------------------

/** Every TLD the curated dataset marks as not-openly-registrable. */
export const RESTRICTED_TLDS: readonly string[] = Object.entries(CURATED)
  .filter(([, c]) => c.registrable !== "open")
  .map(([tld]) => tld);

/** True when the public can't freely register the TLD (restricted eligibility
 * or brand-operated). Derives from the one dataset, so the picker and Detail
 * always agree. Leading dot optional. */
export function isRestrictedTld(tld: string): boolean {
  return getTldContext(tld).registrable !== "open";
}
