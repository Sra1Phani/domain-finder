// Shared domain types for the search → generate → check → rank pipeline.

export type SuggestionSource = "ai" | "rule" | "hack";

export type Suggestion = {
  /** full domain, lowercased, e.g. "coolapp.com" */
  domain: string;
  /** second-level label, e.g. "coolapp" */
  sld: string;
  /** top-level suffix including the dot, e.g. ".com" */
  tld: string;
  source: SuggestionSource;
  /** short human explanation of why this name was suggested */
  rationale?: string;
};

/**
 * Domain status, modelled on Domainr's taxonomy (domainr.com/docs/api/v2/status).
 * The key insight is that "taken" isn't one thing: a parked or about-to-drop
 * domain is a very different prospect from a live business.
 */
export type AvailabilityStatus =
  /** registrable right now (Domainr calls this "inactive") */
  | "available"
  /** registered and in apparent use */
  | "active"
  /** registered, but nameservers point at a parking/for-sale provider */
  | "parked"
  /** in redemption grace period — owner can still restore, may drop soon */
  | "expiring"
  /** pending delete — drops within ~5 days, cannot be restored */
  | "deleting"
  /** reserved/prohibited by registry or ICANN; never registrable */
  | "reserved"
  /** we genuinely can't tell */
  | "unknown";

/** Coarse grouping used for sorting and UI. */
export type AvailabilityBucket =
  | "registrable" // buy it now, at retail
  | "dropping" // will likely become registrable soon — backorder territory
  | "aftermarket" // owned but plausibly for sale
  | "unavailable"
  | "unknown";

export type AvailabilityResult = {
  domain: string;
  /** most significant status (Domainr's "rightmost wins" precedence) */
  status: AvailabilityStatus;
  bucket: AvailabilityBucket;
  /** raw RDAP status codes, for transparency/debugging */
  rawStatuses?: string[];
  /** ISO date the registration expires, from the RDAP expiration event */
  expiresAt?: string;
  /**
   * Estimated ISO date the domain is released to the public. Only set when
   * status is "deleting" (pendingDelete is a fixed ~5-day window). An estimate,
   * not a guarantee.
   */
  estimatedDropAt?: string;
  nameservers?: string[];
  /** provider that produced this result, e.g. "rdap" */
  via: string;
  /** ISO timestamp */
  checkedAt: string;
};

export type RankedSuggestion = Suggestion & {
  availability: AvailabilityResult;
  /** 0–100, higher is a better buy candidate */
  score: number;
  scoreReasons: string[];
};

export type SearchRequest = {
  /** free-text keyword or product description */
  query: string;
  /** optional explicit TLDs to include, e.g. [".com", ".io"] */
  tlds?: string[];
  /** whether to attempt AI brainstorming (defaults true; degrades if no key) */
  useAi?: boolean;
  /** whether to include domain hacks like bit.ly (defaults true) */
  useHacks?: boolean;
};

export type SearchResponse = {
  query: string;
  results: RankedSuggestion[];
  /** meta about how the response was produced */
  meta: {
    generated: number;
    checked: number;
    aiUsed: boolean;
    availabilityProvider: string;
    tookMs: number;
  };
};
