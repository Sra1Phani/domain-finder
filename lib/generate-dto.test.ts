import { strict as assert } from "node:assert";
import { test } from "node:test";
import { toCandidates } from "./generate-dto";
import type { AvailabilityResult, AvailabilityStatus, RankedSuggestion, SearchResponse } from "@domain-finder/core";

const avail = (domain: string, status: AvailabilityStatus): AvailabilityResult => ({
  domain,
  status,
  bucket: "unavailable",
  via: "fake",
  checkedAt: "t",
});

const sug = (
  sld: string,
  tld: string,
  source: RankedSuggestion["source"],
  status: AvailabilityStatus,
  score: number,
  rationale?: string,
): RankedSuggestion => ({
  domain: `${sld}${tld}`,
  sld,
  tld,
  source,
  rationale,
  availability: avail(`${sld}${tld}`, status),
  score,
  scoreReasons: [],
});

const resp = (results: RankedSuggestion[]): SearchResponse => ({
  query: "x",
  results,
  meta: { generated: results.length, checked: results.length, aiUsed: true, availabilityProvider: "rdap", tookMs: 1 },
});

test("maps every source tag", () => {
  const c = toCandidates(
    resp([
      sug("alpha", ".com", "ai", "available", 90, "coined for X"),
      sug("beta", ".com", "rule", "taken", 70, "built from Y"),
      sug("gam", ".es", "hack", "available", 80, "hack"),
    ]),
  );
  assert.deepEqual(
    c.map((x) => x.source),
    ["AI", "rule-based", "domain-hack"],
  );
});

test("maps every status to the UI status (unknown/active/parked never become available)", () => {
  const c = toCandidates(
    resp([
      sug("a", ".com", "ai", "available", 90),
      sug("b", ".com", "ai", "active", 50),
      sug("c", ".com", "ai", "parked", 60),
      sug("d", ".com", "ai", "unknown", 40),
      sug("e", ".com", "ai", "reserved", 30),
    ]),
  );
  assert.deepEqual(
    c.map((x) => x.status),
    ["available", "taken", "parked", "unknown", "taken"],
  );
  // the false-available guard at the DTO layer
  assert.ok(!c.some((x) => x.status === "available" && x.name !== "a"));
});

test("a domain hack displays the full hack but Checks the bare stem", () => {
  const [c] = toCandidates(resp([sug("recip", ".es", "hack", "available", 88, "reads across the dot")]));
  assert.equal(c.name, "recip.es");
  assert.equal(c.checkName, "recip");
  assert.equal(c.domain, "recip.es");
});

test("dedups to one card per distinct name and respects the limit", () => {
  const c = toCandidates(
    resp([
      sug("alpha", ".com", "ai", "available", 95),
      sug("alpha", ".io", "ai", "taken", 80), // same name, lower rank -> dropped
      sug("beta", ".com", "rule", "available", 70),
    ]),
    2,
  );
  assert.equal(c.length, 2);
  assert.deepEqual(c.map((x) => x.name), ["alpha", "beta"]);
  assert.equal(c[0].status, "available", "the best-ranked alpha wins");
});

test("missing rationale becomes empty string, not undefined", () => {
  const [c] = toCandidates(resp([sug("x", ".com", "rule", "available", 50)]));
  assert.equal(c.rationale, "");
});
