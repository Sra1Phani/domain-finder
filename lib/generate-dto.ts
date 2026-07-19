// Thin DTO adapter: /api/search's response -> the Generate UI's candidate shape.
// A surface concern (in the app's lib), pure, and unit-tested. Real fields only —
// generation returns DOMAIN availability per candidate, not per-candidate
// github/npm signals; the path to full cross-surface is the "Check this name"
// button, which routes the name into the Check flow.

import type { SearchResponse } from "@domain-finder/core";
import type { CheckStatus } from "./check-events";

export type GenerateSource = "AI" | "rule-based" | "domain-hack";

export type GenerateCandidate = {
  /** display name — the coined label, or the full hack (e.g. "recip.es") */
  name: string;
  /** the bare name routed into Check (the second-level label) */
  checkName: string;
  /** the representative domain whose availability was actually checked */
  domain: string;
  source: GenerateSource;
  rationale: string;
  /** DOMAIN availability signal only (not cross-surface) */
  status: CheckStatus;
  score: number;
};

const SOURCE_MAP: Record<string, GenerateSource> = {
  ai: "AI",
  rule: "rule-based",
  hack: "domain-hack",
};

/** Domain availability status -> the UI's coarse status. Never invents available. */
function domainStatus(s: string): CheckStatus {
  switch (s) {
    case "available":
      return "available";
    case "parked":
      return "parked";
    case "unknown":
      return "unknown";
    // active / reserved / expiring / deleting — not free to register now
    default:
      return "taken";
  }
}

export function toCandidates(res: SearchResponse, limit = 12): GenerateCandidate[] {
  const seen = new Set<string>();
  const out: GenerateCandidate[] = [];
  for (const r of res.results) {
    const isHack = r.source === "hack";
    const name = isHack ? r.domain : r.sld;
    if (seen.has(name)) continue; // one card per distinct name; best-ranked wins
    seen.add(name);
    out.push({
      name,
      checkName: r.sld,
      domain: r.domain,
      source: SOURCE_MAP[r.source] ?? "AI",
      rationale: r.rationale ?? "",
      status: domainStatus(r.availability.status),
      score: r.score,
    });
    if (out.length >= limit) break;
  }
  return out;
}
