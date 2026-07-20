import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isRestrictedTld, RESTRICTED_TLDS } from "./tlds";

test("isRestrictedTld flags brand-operated/restricted TLDs, with or without a leading dot", () => {
  assert.ok(isRestrictedTld(".map"));
  assert.ok(isRestrictedTld("map"));
  assert.ok(isRestrictedTld(".GOV")); // case-insensitive
  assert.ok(isRestrictedTld(".google"));
});

test("isRestrictedTld does NOT flag ordinary registrable TLDs", () => {
  for (const tld of [".com", ".io", ".ai", ".dev", ".app", ".co", ".xyz", ".me"]) {
    assert.equal(isRestrictedTld(tld), false, `${tld} should be registrable`);
  }
});

test("the restricted list is non-empty and every entry carries a leading dot", () => {
  assert.ok(RESTRICTED_TLDS.length > 0);
  for (const t of RESTRICTED_TLDS) assert.ok(t.startsWith("."), `${t} needs a leading dot`);
});
