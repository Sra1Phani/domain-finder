// Characterization tests for domain hacks — the SAME split behavior pinned
// before the refactor, now with fetch and cache injected instead of a global
// fetch stub and a module-global promise.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createMemoryCache, domainHacks, type FetchLike, type HackDeps } from "./index";

const IANA_TLDS = "https://data.iana.org/TLD/tlds-alpha-by-domain.txt";

function deps(list: string[]): HackDeps {
  const fetch: FetchLike = async (url) =>
    url === IANA_TLDS
      ? new Response("# header\n" + list.join("\n") + "\n", { status: 200 })
      : new Response("", { status: 404 });
  return { fetch, cache: createMemoryCache() };
}

test("splits a word across a matching zone with a long-enough stem", async () => {
  const hacks = await domainHacks(["bitly", "recipes"], deps(["LY", "ES", "COM"]));
  const domains = hacks.map((h) => h.domain);
  assert.ok(domains.includes("bit.ly"));
  assert.ok(domains.includes("recip.es"));
  const bit = hacks.find((h) => h.domain === "bit.ly")!;
  assert.equal(bit.sld, "bit");
  assert.equal(bit.tld, ".ly");
  assert.equal(bit.source, "hack");
});

test("rejects a stem shorter than MIN_STEM", async () => {
  // "gly" -> stem "g" (1 char) is below MIN_STEM, so no hack.
  const hacks = await domainHacks(["gly"], deps(["LY"]));
  assert.equal(hacks.length, 0);
});

test("a word with no matching zone yields nothing", async () => {
  const hacks = await domainHacks(["foobar"], deps(["LY", "ES"]));
  assert.equal(hacks.length, 0);
});
