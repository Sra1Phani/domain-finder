import { strict as assert } from "node:assert";
import { test } from "node:test";
import { getTldContext, isRestrictedTld, RESTRICTED_TLDS } from "./tld-context";

test("getTldContext returns curated rich data for a curated TLD", () => {
  const com = getTldContext(".com");
  assert.equal(com.curated, true);
  assert.equal(com.registrable, "open");
  assert.equal(com.kind, "gTLD");
  assert.ok(com.gotcha, "curated .com has a gotcha");
  assert.equal(com.priceBand, "$");

  // leading dot optional, case-insensitive
  assert.deepEqual(getTldContext("IO"), getTldContext(".io"));
});

test("getTldContext returns a non-blank fallback for an uncurated TLD", () => {
  const f = getTldContext(".zzq");
  assert.equal(f.curated, false);
  assert.equal(f.registrable, "open"); // unknown ⇒ honest default
  assert.equal(f.kind, "gTLD");
  assert.equal(f.priceBand, undefined, "we don't fabricate a price band for unknown TLDs");
  assert.equal(f.tld, ".zzq");

  // 2-letter unknown ⇒ ccTLD heuristic
  assert.equal(getTldContext(".zz").kind, "ccTLD");
});

test("restricted TLDs report registrable != open, with a requirement", () => {
  const th = getTldContext(".th");
  assert.equal(th.registrable, "restricted");
  assert.ok(th.restriction && th.restriction.length > 0, ".th states its eligibility requirement");

  const google = getTldContext(".google");
  assert.equal(google.registrable, "brand");

  const us = getTldContext(".us");
  assert.equal(us.registrable, "restricted");
});

test("isRestrictedTld derives from the one dataset (single source of truth)", () => {
  assert.ok(isRestrictedTld(".map"));
  assert.ok(isRestrictedTld("map")); // dot optional
  assert.ok(isRestrictedTld(".GOV")); // case-insensitive
  assert.ok(isRestrictedTld(".th")); // eligibility-restricted, not just brand
  for (const tld of [".com", ".io", ".ai", ".dev", ".app", ".co", ".xyz", ".me"]) {
    assert.equal(isRestrictedTld(tld), false, `${tld} should be registrable`);
  }
});

test("RESTRICTED_TLDS is derived, non-empty, and dotted", () => {
  assert.ok(RESTRICTED_TLDS.length > 0);
  for (const t of RESTRICTED_TLDS) assert.ok(t.startsWith("."), `${t} needs a leading dot`);
  assert.ok(RESTRICTED_TLDS.includes(".map"));
  assert.ok(RESTRICTED_TLDS.includes(".th"));
  assert.ok(!RESTRICTED_TLDS.includes(".com"));
});
