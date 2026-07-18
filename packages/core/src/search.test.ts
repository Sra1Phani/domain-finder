// Integration test for the search() façade — the orchestrator every surface
// (web app now, MCP + REST later) calls, and the one piece the extraction left
// proven only transitively. Wires FAKES through createCore and asserts the
// collaborators compose end to end: generation -> availability -> ranking ->
// the response shape a surface consumes. Fully deterministic: no network, no
// real AI, no DB.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  createCore,
  createMemoryCache,
  type FetchLike,
  type GenerateObjectFn,
} from "./index";

const IANA_BOOTSTRAP = "https://data.iana.org/rdap/dns.json";
const REGISTRY = "https://rdap.test/";

// Deterministic RDAP: alpha.com is free (404), beta.com is taken (200/active),
// everything else free. .com resolves to the fake registry via the bootstrap.
const rdapFetch: FetchLike = async (url) => {
  if (url === IANA_BOOTSTRAP) {
    return new Response(JSON.stringify({ services: [[["com"], [REGISTRY]]] }), {
      status: 200,
    });
  }
  if (url.startsWith(REGISTRY + "domain/")) {
    const domain = decodeURIComponent(url.slice((REGISTRY + "domain/").length));
    if (domain === "beta.com") {
      return new Response(
        JSON.stringify({
          status: ["client transfer prohibited"],
          events: [{ eventAction: "expiration", eventDate: "2030-01-01T00:00:00Z" }],
        }),
        { status: 200 },
      );
    }
    return new Response("", { status: 404 }); // available
  }
  return new Response("", { status: 404 });
};

// Fixed AI output: two coined labels, so the AI path visibly feeds candidates.
const fixedNames: GenerateObjectFn = async <T,>() =>
  ({
    object: {
      names: [
        { name: "alpha", rationale: "coined-a" },
        { name: "beta", rationale: "coined-b" },
      ],
    } as unknown as T,
  });

const fixedClock = () => new Date("2026-07-18T00:00:00Z");

test("search() composes generation -> availability -> ranking into a surface response", async () => {
  const core = createCore({
    fetch: rdapFetch,
    now: fixedClock,
    cache: createMemoryCache(() => fixedClock().getTime()),
    config: { aiApiKey: "present", aiModel: "test/model" },
    generateObject: fixedNames,
  });

  const res = await core.search({
    query: "recipe sharing app",
    tlds: [".com"],
    useAi: true,
    useHacks: false, // keep it to the fake registry; no IANA zone fetch
  });

  // Response shape a surface consumes.
  assert.deepEqual(Object.keys(res).sort(), ["meta", "query", "results"]);
  assert.equal(res.query, "recipe sharing app");
  assert.deepEqual(Object.keys(res.meta).sort(), [
    "aiUsed",
    "availabilityProvider",
    "checked",
    "generated",
    "tookMs",
  ]);
  assert.equal(res.meta.availabilityProvider, "rdap");
  assert.equal(res.meta.aiUsed, true, "the fake AI output fed the pipeline");
  assert.ok(res.meta.generated > 0);
  assert.equal(res.meta.checked, res.meta.generated, "every candidate was resolved");

  // Generation fed the AI-coined labels through as candidates.
  const byDomain = new Map(res.results.map((r) => [r.domain, r]));
  assert.ok(byDomain.has("alpha.com"), "AI label alpha reached the results");
  assert.ok(byDomain.has("beta.com"), "AI label beta reached the results");

  // Availability resolved them (mix of available + taken, as scripted).
  assert.equal(byDomain.get("alpha.com")!.availability.status, "available");
  assert.equal(byDomain.get("beta.com")!.availability.status, "active");

  // Each result carries the full contract a surface renders.
  const one = byDomain.get("alpha.com")!;
  for (const k of ["domain", "sld", "tld", "source", "score", "scoreReasons", "availability"]) {
    assert.ok(k in one, `result missing field: ${k}`);
  }
  assert.ok(Array.isArray(one.scoreReasons) && one.scoreReasons.length > 0);

  // Ranking is bucket-first: the available candidate outranks the taken one.
  const idx = (d: string) => res.results.findIndex((r) => r.domain === d);
  assert.ok(
    idx("alpha.com") < idx("beta.com"),
    "registrable must sort ahead of unavailable regardless of score",
  );
  // And the taken domain sits in the unavailable tail — nothing registrable
  // ranks below it.
  const betaIdx = idx("beta.com");
  assert.ok(
    res.results.slice(0, betaIdx).every((r) => r.availability.bucket !== "unavailable"),
    "no unavailable result should outrank a registrable one",
  );
});

test("search() degrades: with no AI transport it still returns ranked rule-based results", async () => {
  const core = createCore({
    fetch: rdapFetch,
    now: fixedClock,
    cache: createMemoryCache(() => fixedClock().getTime()),
    config: {}, // no aiApiKey
    // no generateObject injected
  });

  const res = await core.search({
    query: "recipe sharing app",
    tlds: [".com"],
    useAi: true, // asked for AI, but there's no transport -> must degrade, not throw
    useHacks: false,
  });

  assert.equal(res.meta.aiUsed, false, "no AI transport => degraded");
  assert.ok(res.results.length > 0, "rule-based generation still produces candidates");
  assert.ok(res.results.every((r) => r.source === "rule"));
  // Still fully ranked and scored.
  assert.ok(res.results.every((r) => typeof r.score === "number"));
});
