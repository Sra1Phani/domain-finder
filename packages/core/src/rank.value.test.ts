// Tests for the structural value score and its role as the within-bucket
// tiebreaker. Availability must always dominate value.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { rankSuggestions, valueScore } from "./rank";
import type { AvailabilityResult, AvailabilityStatus, Suggestion } from "./types";
import { bucketFor } from "./rdap-status";

const sug = (sld: string, tld: string, source: Suggestion["source"] = "rule"): Suggestion => ({
  domain: `${sld}${tld}`,
  sld,
  tld,
  source,
});

const avail = (domain: string, status: AvailabilityStatus): AvailabilityResult => ({
  domain,
  status,
  bucket: bucketFor(status),
  via: "fake",
  checkedAt: "t",
});

test("valueScore: a short clean .com outranks a long hyphenated .xyz", () => {
  const good = valueScore(sug("acme", ".com"));
  const bad = valueScore(sug("my-really-long-brand-name", ".xyz"));
  assert.ok(good > bad, `expected ${good} > ${bad}`);
});

test("valueScore rewards a higher TLD tier and penalizes digits/hyphens", () => {
  assert.ok(valueScore(sug("acme", ".com")) > valueScore(sug("acme", ".xyz")), "tld tier");
  assert.ok(valueScore(sug("acme", ".com")) > valueScore(sug("ac-me", ".com")), "hyphen");
  assert.ok(valueScore(sug("acme", ".com")) > valueScore(sug("acme4", ".com")), "digit");
});

test("availability dominates: an available name outranks a shorter taken one", () => {
  const taken = sug("go", ".com"); // very short + best TLD, but registered
  const free = sug("longbrandname", ".com"); // longer, but available
  const ranked = rankSuggestions(
    [taken, free],
    [avail("go.com", "active"), avail("longbrandname.com", "available")],
  );
  assert.equal(ranked[0].domain, "longbrandname.com", "available must rank first");
  assert.equal(ranked[1].domain, "go.com");
});

test("within the same availability bucket, value breaks the tie", () => {
  const a = sug("acme", ".com"); // short, best TLD
  const b = sug("some-longer-thing", ".xyz"); // long + hyphen + weak TLD
  const ranked = rankSuggestions(
    [b, a], // input order deliberately worst-first
    [avail("some-longer-thing.xyz", "available"), avail("acme.com", "available")],
  );
  assert.equal(ranked[0].domain, "acme.com", "higher value ranks first within the bucket");
});
