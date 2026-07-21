import { strict as assert } from "node:assert";
import { test } from "node:test";
import { byTldValue } from "./tld-order";

test("byTldValue orders higher-tier TLDs first (.com before .xyz)", () => {
  const sorted = [".xyz", ".com", ".io", ".me"].sort(byTldValue);
  assert.equal(sorted[0], ".com");
  assert.ok(sorted.indexOf(".io") < sorted.indexOf(".xyz"), ".io beats .xyz");
});

test("byTldValue breaks ties deterministically (shorter, then alphabetical)", () => {
  // two unknown TLDs share the default weight → shorter/alpha decides
  assert.ok(byTldValue(".aa", ".bbbb") < 0, "shorter first");
  assert.ok(byTldValue(".ab", ".aa") > 0, "alphabetical when same length");
});
