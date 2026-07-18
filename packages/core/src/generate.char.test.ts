// Characterization tests for generation — the SAME invariant pinned before the
// refactor (no AI credentials => rule-based only), now expressed through
// injected config instead of process.env. The degrade trigger moved from an env
// read to `config.aiApiKey` absence; the asserted behavior is identical.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createCore, type FetchLike } from "./index";

const IANA_TLDS = "https://data.iana.org/TLD/tlds-alpha-by-domain.txt";

const notFound: FetchLike = async () => new Response("", { status: 404 });

test("with no AI credentials, generation degrades to rule-based (aiUsed false)", async () => {
  // No aiApiKey in config, no generateObject injected => AI path is off.
  const core = createCore({ fetch: notFound, config: {} });
  const { suggestions, aiUsed } = await core.generateSuggestions("recipe sharing app", {
    useAi: true,
    useHacks: false,
  });
  assert.equal(aiUsed, false);
  assert.ok(suggestions.length > 0);
  assert.ok(
    suggestions.every((s) => s.source === "rule"),
    "every candidate is rule-based when AI is unavailable",
  );
});

test("useAi:false forces the rule-based path regardless of credentials", async () => {
  // Even with a key present, useAi:false must skip AI entirely.
  const core = createCore({
    fetch: notFound,
    config: { aiApiKey: "present" },
    generateObject: async () => {
      throw new Error("AI must not be called when useAi is false");
    },
  });
  const { aiUsed, suggestions } = await core.generateSuggestions("vegan meal delivery", {
    useAi: false,
    useHacks: false,
  });
  assert.equal(aiUsed, false);
  assert.ok(suggestions.every((s) => s.source === "rule"));
});

test("domain hacks are produced from the query's own words", async () => {
  const fetchFn: FetchLike = async (url) =>
    url === IANA_TLDS
      ? new Response("# comment\nLY\nES\nCOM\nIO\n", { status: 200 })
      : new Response("", { status: 404 });

  const core = createCore({ fetch: fetchFn, config: {} });
  const { suggestions } = await core.generateSuggestions("bitly recipes", {
    useAi: false,
    useHacks: true,
  });
  const hacks = suggestions.filter((s) => s.source === "hack").map((s) => s.domain);
  assert.ok(hacks.includes("bit.ly"), `expected bit.ly among ${JSON.stringify(hacks)}`);
});
