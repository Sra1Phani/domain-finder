import { strict as assert } from "node:assert";
import { test } from "node:test";
import { streamBrand, type BrandStreamEvent, type StreamBrandCtx } from "./brand";
import { createCore, type FetchLike } from "./index";
import type { AvailabilityResult, AvailabilityStatus, NamespaceResult, NamespaceStatus } from "./types";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const bucketOf = (s: AvailabilityStatus) =>
  s === "available" ? "registrable" : s === "unknown" ? "unknown" : "unavailable";

const avail = (domain: string, status: AvailabilityStatus): AvailabilityResult => ({
  domain,
  status,
  bucket: bucketOf(status) as AvailabilityResult["bucket"],
  via: "fake",
  checkedAt: "t",
});

const ns = (surface: NamespaceResult["surface"], name: string, status: NamespaceStatus): NamespaceResult => ({
  surface,
  name,
  normalized: name,
  status,
  checkedAt: "t",
});

async function collect(gen: AsyncGenerator<BrandStreamEvent>): Promise<BrandStreamEvent[]> {
  const out: BrandStreamEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

test("streamBrand yields a FAST surface before a SLOW one, regardless of input order", async () => {
  // Domain thunk (acme.com) is listed BEFORE the npm namespace thunk, but npm
  // settles first — so npm must be yielded first. Settle order is controlled by
  // hand via deferred promises (no timers, fully deterministic).
  const dom = deferred<AvailabilityResult>();
  const npm = deferred<NamespaceResult>();
  const ctx: StreamBrandCtx = {
    checkDomain: () => dom.promise,
    checkNamespace: () => npm.promise,
    concurrency: 10,
  };

  const gen = streamBrand("acme", { tlds: ["com"], surfaces: ["npm"] }, ctx);

  const init = await gen.next();
  assert.deepEqual(init.value, { kind: "init", surfaces: ["acme.com", "npm"] });

  npm.resolve(ns("npm", "acme", "available")); // the later-listed thunk settles first
  const first = await gen.next();
  assert.equal(first.value && first.value.kind, "result");
  assert.equal((first.value as { surface: string }).surface, "npm");

  dom.resolve(avail("acme.com", "available"));
  const second = await gen.next();
  assert.equal((second.value as { surface: string }).surface, "acme.com");

  const summary = await gen.next();
  assert.equal(summary.value && summary.value.kind, "summary");
  assert.equal((await gen.next()).done, true);
});

test("init lists every surface; each is emitted exactly once; summary is correct", async () => {
  const table: Record<string, AvailabilityResult | NamespaceResult> = {
    "acme.com": avail("acme.com", "active"), // taken
    "acme.io": avail("acme.io", "available"),
    github: ns("github", "acme", "available"),
    npm: ns("npm", "acme", "taken"),
    pypi: ns("pypi", "acme", "available"),
  };
  const ctx: StreamBrandCtx = {
    checkDomain: async (d) => table[d] as AvailabilityResult,
    checkNamespace: async (_n, s) => table[s] as NamespaceResult,
  };

  const events = await collect(
    streamBrand("acme", { tlds: ["com", "io"], surfaces: ["github", "npm", "pypi"] }, ctx),
  );

  const expected = ["acme.com", "acme.io", "github", "npm", "pypi"];
  assert.equal(events[0].kind, "init");
  assert.deepEqual([...(events[0] as { surfaces: string[] }).surfaces].sort(), [...expected].sort());

  const results = events.filter((e) => e.kind === "result");
  assert.equal(results.length, 5, "one result per surface");
  assert.deepEqual(
    results.map((e) => (e as { surface: string }).surface).sort(),
    [...expected].sort(),
  );

  const summary = events.at(-1);
  assert.equal(summary?.kind, "summary");
  assert.equal((summary as { allClear: boolean }).allClear, false);
  assert.deepEqual([...(summary as { takenOn: string[] }).takenOn].sort(), ["acme.com", "npm"].sort());
});

test("an 'unknown' surface flows through, is never available, and blocks allClear", async () => {
  const ctx: StreamBrandCtx = {
    checkDomain: async (d) => avail(d, "available"),
    checkNamespace: async (_n, s) => ns(s, "acme", s === "github" ? "unknown" : "available"),
  };

  const events = await collect(
    streamBrand("acme", { tlds: ["com"], surfaces: ["github", "npm"] }, ctx),
  );

  const gh = events.find((e) => e.kind === "result" && (e as { surface: string }).surface === "github");
  assert.equal((gh as { result: NamespaceResult }).result.status, "unknown");

  const summary = events.at(-1) as { allClear: boolean; takenOn: string[] };
  assert.equal(summary.allClear, false, "unknown must block allClear");
  assert.ok(!summary.takenOn.includes("github"), "unknown is not 'taken'");
});

test("core.streamBrand end-to-end: a 500 from a registry yields unknown (real providers)", async () => {
  const IANA_BOOTSTRAP = "https://data.iana.org/rdap/dns.json";
  const REGISTRY = "https://rdap.test/";
  const fetchFn: FetchLike = async (url) => {
    if (url === IANA_BOOTSTRAP) {
      return new Response(JSON.stringify({ services: [[["com"], [REGISTRY]]] }), { status: 200 });
    }
    if (url.startsWith(REGISTRY + "domain/")) return new Response("", { status: 404 }); // available
    if (url.startsWith("https://registry.npmjs.org/")) return new Response("", { status: 500 }); // -> unknown
    if (url.startsWith("https://pypi.org/pypi/")) return new Response("", { status: 404 });
    if (url.startsWith("https://api.github.com/users/")) return new Response("", { status: 404 });
    return new Response("", { status: 404 });
  };
  const core = createCore({ fetch: fetchFn });

  const events = await collect(
    core.streamBrand("acme", { tlds: ["com"], surfaces: ["npm", "pypi", "github"] }),
  );

  const npm = events.find((e) => e.kind === "result" && (e as { surface: string }).surface === "npm");
  assert.equal((npm as { result: NamespaceResult }).result.status, "unknown");
  const summary = events.at(-1) as { allClear: boolean };
  assert.equal(summary.allClear, false, "a 500 -> unknown must block allClear, never fabricate available");
});
