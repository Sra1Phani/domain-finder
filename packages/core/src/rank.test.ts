// Characterization tests for the ranker — added during the core extraction to
// pin CURRENT behaviour before it moved packages. These assert the exact scores
// and ordering the code produces today, so a future change that shifts the
// formula or the sort has to be a deliberate edit to these numbers.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { rankSuggestions, scoreSuggestion } from "./rank";
import type { AvailabilityResult, Suggestion } from "./types";

const sug = (sld: string, tld: string, source: Suggestion["source"]): Suggestion => ({
  domain: sld + tld,
  sld,
  tld,
  source,
});

const avail = (
  domain: string,
  status: AvailabilityResult["status"],
  bucket: AvailabilityResult["bucket"],
): AvailabilityResult => ({
  domain,
  status,
  bucket,
  via: "test",
  checkedAt: "2026-01-01T00:00:00Z",
});

test("available .com, short & clean, scores near the top", () => {
  const r = scoreSuggestion(sug("foo", ".com", "rule"), avail("foo.com", "available", "registrable"));
  assert.equal(r.score, 97);
  assert.deepEqual(r.reasons, [
    "available to register",
    ".com TLD",
    "3 chars",
    "no hyphens",
    "no digits",
  ]);
});

test("the same name, but taken, loses exactly the availability component", () => {
  const r = scoreSuggestion(sug("foo", ".com", "rule"), avail("foo.com", "active", "unavailable"));
  assert.equal(r.score, 52); // 97 - 45 (the availability weight)
  assert.equal(r.reasons[0], "registered and in use");
});

test("an available domain hack on an off-table TLD", () => {
  const r = scoreSuggestion(sug("recip", ".es", "hack"), avail("recip.es", "available", "registrable"));
  assert.equal(r.score, 88);
});

test("hyphens and digits cost the cleanliness points; parked is graded partial", () => {
  const r = scoreSuggestion(sug("my-app2", ".com", "ai"), avail("my-app2.com", "parked", "aftermarket"));
  assert.equal(r.score, 62);
  assert.ok(r.reasons.includes("contains hyphen"));
  assert.ok(r.reasons.includes("contains digits"));
  assert.ok(r.reasons.includes("parked — may be for sale"));
});

test("pendingDelete is graded high but below available", () => {
  const r = scoreSuggestion(sug("word", ".io", "ai"), avail("word.io", "deleting", "dropping"));
  assert.equal(r.score, 87);
  assert.equal(r.reasons[0], "pending delete — drops in days");
});

test("ranking is bucket-first, then score — a lower-scoring registrable beats a higher-scoring dropping", () => {
  const suggestions = [
    sug("taken", ".com", "rule"),
    sug("freea", ".com", "rule"),
    sug("drop", ".io", "ai"),
    sug("park", ".com", "rule"),
    sug("freeb", ".xyz", "rule"),
  ];
  const availability = [
    avail("taken.com", "active", "unavailable"),
    avail("freea.com", "available", "registrable"),
    avail("drop.io", "deleting", "dropping"),
    avail("park.com", "parked", "aftermarket"),
    avail("freeb.xyz", "available", "registrable"),
  ];

  const ordered = rankSuggestions(suggestions, availability).map((r) => r.domain);
  // freeb.xyz (86) outranks drop.io (87): registrable beats dropping regardless of score.
  assert.deepEqual(ordered, ["freea.com", "freeb.xyz", "drop.io", "park.com", "taken.com"]);
});

test("rankSuggestions attaches availability and reasons to each result", () => {
  const [r] = rankSuggestions([sug("foo", ".com", "rule")], [avail("foo.com", "available", "registrable")]);
  assert.equal(r.availability.status, "available");
  assert.equal(r.score, 97);
  assert.ok(Array.isArray(r.scoreReasons) && r.scoreReasons.length > 0);
});

test("a missing availability entry falls back to unknown rather than throwing", () => {
  const [r] = rankSuggestions([sug("foo", ".com", "rule")], []);
  assert.equal(r.availability.status, "unknown");
  assert.equal(r.availability.bucket, "unknown");
});
