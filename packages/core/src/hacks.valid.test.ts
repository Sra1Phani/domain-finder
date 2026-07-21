// Hacks must only split on openly-registrable, IANA-delegated zones — a
// "career.map"-style hack on a brand-operated TLD you can never register is
// noise and must be filtered out.

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

test("a hack on a restricted/brand-operated zone is dropped; a normal one survives", async () => {
  // .map is delegated but brand-operated (restricted); .ly is openly registrable.
  const hacks = await domainHacks(["careermap", "bitly"], deps(["MAP", "LY", "COM"]));
  const domains = hacks.map((h) => h.domain);
  assert.ok(domains.includes("bit.ly"), `expected bit.ly among ${JSON.stringify(domains)}`);
  assert.ok(!domains.some((d) => d.endsWith(".map")), "restricted .map hack must be filtered out");
});
