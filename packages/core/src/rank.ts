// Scoring + ranking. Turns (suggestion + availability) into a 0–100 "buy
// candidate" score with human-readable reasons, then sorts best-first.

import type {
  AvailabilityResult,
  RankedSuggestion,
  Suggestion,
} from "./types";
import { tldWeight } from "./tlds";

// Component weights (sum of maxima = 100).
const W_AVAILABILITY = 45;
const W_TLD = 20;
const W_LENGTH = 20;
const W_CLEAN = 10;
const W_BRAND = 5;

function availabilityPoints(status: AvailabilityResult["status"]): [number, string] {
  switch (status) {
    case "available":
      return [W_AVAILABILITY, "available to register"];
    // Drops soon — the highest-intent moment there is, just not buyable today.
    case "deleting":
      return [W_AVAILABILITY * 0.8, "pending delete — drops in days"];
    case "expiring":
      return [W_AVAILABILITY * 0.6, "in redemption — may drop soon"];
    // Owned, but the owner is signalling they'd sell.
    case "parked":
      return [W_AVAILABILITY * 0.45, "parked — may be for sale"];
    case "unknown":
      return [W_AVAILABILITY * 0.33, "availability unknown"];
    case "active":
      return [0, "registered and in use"];
    case "reserved":
      return [0, "reserved — never registrable"];
  }
}

function lengthPoints(sld: string): [number, string] {
  const len = sld.length;
  // Full marks up to 6 chars, tapering to 0 by ~18 chars.
  const raw = len <= 6 ? 1 : Math.max(0, 1 - (len - 6) / 12);
  const pts = Math.round(raw * W_LENGTH);
  return [pts, `${len} chars`];
}

function cleanPoints(sld: string): [number, string[]] {
  const reasons: string[] = [];
  let pts = 0;
  if (!sld.includes("-")) {
    pts += W_CLEAN * 0.6;
    reasons.push("no hyphens");
  } else {
    reasons.push("contains hyphen");
  }
  if (!/\d/.test(sld)) {
    pts += W_CLEAN * 0.4;
    reasons.push("no digits");
  } else {
    reasons.push("contains digits");
  }
  return [pts, reasons];
}

export function scoreSuggestion(
  suggestion: Suggestion,
  availability: AvailabilityResult,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];

  const [availPts, availReason] = availabilityPoints(availability.status);
  reasons.push(availReason);

  const tldW = tldWeight(suggestion.tld);
  const tldPts = tldW * W_TLD;
  reasons.push(`${suggestion.tld} TLD`);

  const [lenPts, lenReason] = lengthPoints(suggestion.sld);
  reasons.push(lenReason);

  const [cleanPts, cleanReasons] = cleanPoints(suggestion.sld);
  reasons.push(...cleanReasons);

  // Nudge for the more inventive sources. Hacks are the most distinctive thing
  // we produce; AI names tend to be more brandable than mechanical combos.
  const brandPts =
    suggestion.source === "hack"
      ? W_BRAND
      : suggestion.source === "ai"
        ? W_BRAND * 0.8
        : W_BRAND * 0.4;

  const score = Math.round(
    Math.min(100, availPts + tldPts + lenPts + cleanPts + brandPts),
  );
  return { score, reasons };
}

/** Pair suggestions with availability results (index-aligned) and sort. */
export function rankSuggestions(
  suggestions: Suggestion[],
  availability: AvailabilityResult[],
): RankedSuggestion[] {
  const ranked = suggestions.map((s, i) => {
    const avail =
      availability[i] ?? {
        domain: s.domain,
        status: "unknown" as const,
        bucket: "unknown" as const,
        via: "none",
        checkedAt: new Date().toISOString(),
      };
    const { score, reasons } = scoreSuggestion(s, avail);
    return { ...s, availability: avail, score, scoreReasons: reasons };
  });

  // Sort by bucket first, so "buy it now" always beats "might be gettable",
  // which beats "owned" — then by score within a bucket.
  const BUCKET_ORDER: Record<RankedSuggestion["availability"]["bucket"], number> = {
    registrable: 4,
    dropping: 3,
    aftermarket: 2,
    unknown: 1,
    unavailable: 0,
  };

  ranked.sort((a, b) => {
    const byBucket =
      BUCKET_ORDER[b.availability.bucket] - BUCKET_ORDER[a.availability.bucket];
    if (byBucket !== 0) return byBucket;
    return b.score - a.score;
  });

  return ranked;
}
