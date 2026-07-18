// Unit tests for the MCP tool handlers — the testable core of the surface,
// exercised WITHOUT the transport. Fakes injected via createCore; no network.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createCore, type FetchLike } from "@domain-finder/core";
import { checkNameHandler, generateNamesHandler } from "./handlers";

const IANA_BOOTSTRAP = "https://data.iana.org/rdap/dns.json";
const IANA_TLDS = "https://data.iana.org/TLD/tlds-alpha-by-domain.txt";
const REGISTRY = "https://rdap.test/";

// Fake fetch covering RDAP + the three registries. `script` sets namespace
// statuses; `calls` records every URL so tests can assert what was hit.
function makeFetch(
  script: { npm?: number; pypi?: number; github?: number } = {},
  calls: string[] = [],
): FetchLike {
  return async (url) => {
    calls.push(url);
    if (url === IANA_BOOTSTRAP) {
      return new Response(
        JSON.stringify({ services: [[["com", "io", "dev", "app", "ai"], [REGISTRY]]] }),
        { status: 200 },
      );
    }
    if (url === IANA_TLDS) {
      return new Response("# h\nLY\nES\nCOM\nIO\n", { status: 200 });
    }
    if (url.startsWith(REGISTRY + "domain/")) return new Response("", { status: 404 });
    if (url.startsWith("https://registry.npmjs.org/"))
      return new Response("", { status: script.npm ?? 404 });
    if (url.startsWith("https://pypi.org/pypi/"))
      return new Response("", { status: script.pypi ?? 404 });
    if (url.startsWith("https://api.github.com/users/"))
      return new Response("", { status: script.github ?? 404 });
    return new Response("", { status: 404 });
  };
}

test("check_name composes brand results and never coerces 'unknown' to available", async () => {
  // github 500 => unknown; pypi 200 => taken; npm 404 => available.
  const core = createCore({ fetch: makeFetch({ github: 500, pypi: 200, npm: 404 }) });

  const out = await checkNameHandler({ names: ["acme"] }, core);
  const sc = out.structuredContent as {
    results: Array<{
      name: string;
      domains: Array<{ status: string }>;
      namespaces: Array<{ surface: string; status: string }>;
      summary: { allClear: boolean; takenOn: string[] };
    }>;
  };

  assert.equal(sc.results.length, 1);
  const r = sc.results[0];
  assert.equal(r.name, "acme");
  assert.equal(r.domains.length, 5); // com/io/dev/app/ai

  const ns = new Map(r.namespaces.map((n) => [n.surface, n.status]));
  assert.equal(ns.get("github"), "unknown", "500 must stay unknown, not available");
  assert.equal(ns.get("npm"), "available");
  assert.equal(ns.get("pypi"), "taken");

  // The trap: unknown must NOT count as available, NOT count as taken, and must
  // block allClear.
  assert.equal(r.summary.allClear, false);
  assert.ok(r.summary.takenOn.includes("pypi"));
  assert.ok(!r.summary.takenOn.includes("github"), "unknown is not 'taken'");
  assert.match(out.text, /acme/);
});

test("check_name: allClear only when every surface is confirmed available", async () => {
  const core = createCore({ fetch: makeFetch({ github: 404, npm: 404, pypi: 404 }) });
  const out = await checkNameHandler({ names: ["zzq-free-name"] }, core);
  const sc = out.structuredContent as { results: Array<{ summary: { allClear: boolean } }> };
  assert.equal(sc.results[0].summary.allClear, true);
});

test("check_name handles multiple names", async () => {
  const core = createCore({ fetch: makeFetch() });
  const out = await checkNameHandler({ names: ["one", "two", "three"] }, core);
  const sc = out.structuredContent as { results: Array<{ name: string }> };
  assert.deepEqual(sc.results.map((r) => r.name), ["one", "two", "three"]);
});

test("generate_names passes useHacks=false through (no IANA zone fetch)", async () => {
  const calls: string[] = [];
  const core = createCore({ fetch: makeFetch({}, calls) });

  const out = await generateNamesHandler(
    { description: "recipe sharing app", useHacks: false },
    core,
  );
  const sc = out.structuredContent as { candidates: unknown[]; aiUsed: boolean };

  assert.ok(sc.candidates.length > 0, "produces candidates");
  assert.equal(sc.aiUsed, false, "no AI transport => rule-based");
  assert.ok(!calls.includes(IANA_TLDS), "useHacks:false must NOT trigger the zone fetch");
});

test("generate_names passes useHacks=true through (IANA zone fetch happens)", async () => {
  const calls: string[] = [];
  const core = createCore({ fetch: makeFetch({}, calls) });

  await generateNamesHandler(
    { description: "bitly recipes", useHacks: true },
    core,
  );
  assert.ok(calls.includes(IANA_TLDS), "useHacks:true must trigger the zone fetch");
});

test("generate_names respects count (slices to the requested number)", async () => {
  const core = createCore({ fetch: makeFetch() });
  const out = await generateNamesHandler(
    { description: "recipe sharing app for busy families", count: 3, useHacks: false },
    core,
  );
  const sc = out.structuredContent as { candidates: unknown[] };
  assert.ok(sc.candidates.length <= 3);
});
