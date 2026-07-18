// Characterization tests for availability — the SAME assertions that were
// pinned against the pre-refactor code (global fetch), now driven through the
// injected `fetch` dependency via createCore. Same RDAP responses in → same
// AvailabilityResult out. That the expected values are unchanged across the
// inversion is the proof the refactor preserved behavior.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createCore, type FetchLike } from "./index";

const IANA_BOOTSTRAP = "https://data.iana.org/rdap/dns.json";
const REGISTRY = "https://rdap.test/";

// Route a fake fetch by URL: the IANA bootstrap maps .com -> our fake registry;
// the registry answers per-domain from a scripted function.
function makeFetch(
  registry: (domain: string) => Response,
  calls?: string[],
): FetchLike {
  return async (url: string) => {
    calls?.push(url);
    if (url === IANA_BOOTSTRAP) {
      return new Response(JSON.stringify({ services: [[["com"], [REGISTRY]]] }), {
        status: 200,
      });
    }
    if (url.startsWith(REGISTRY + "domain/")) {
      return registry(decodeURIComponent(url.slice((REGISTRY + "domain/").length)));
    }
    return new Response("not found", { status: 404 });
  };
}

// A fresh core per test => a fresh cache => fully reset cache state. rawProvider
// is the uncached provider, so these characterize raw RDAP behavior directly.
const coreWith = (fetchFn: FetchLike) => createCore({ fetch: fetchFn });

const rdapBody = (over: object) =>
  new Response(JSON.stringify(over), {
    status: 200,
    headers: { "content-type": "application/rdap+json" },
  });

test("a registry 404 means available", async () => {
  const core = coreWith(makeFetch(() => new Response("", { status: 404 })));
  const r = await core.rawProvider.check("free-xyz.com");
  assert.equal(r.status, "available");
  assert.equal(r.bucket, "registrable");
  assert.equal(r.via, "rdap");
});

test("a registry 200 is parsed through the status taxonomy", async () => {
  const core = coreWith(
    makeFetch(() =>
      rdapBody({
        status: ["client transfer prohibited"],
        events: [{ eventAction: "expiration", eventDate: "2030-01-01T00:00:00Z" }],
        nameservers: [{ ldhName: "NS1.SOMEHOST.COM" }],
      }),
    ),
  );
  const r = await core.rawProvider.check("taken.com");
  assert.equal(r.status, "active");
  assert.equal(r.bucket, "unavailable");
  assert.equal(r.expiresAt, "2030-01-01T00:00:00Z");
});

test("pendingDelete in the RDAP record surfaces as deleting", async () => {
  const core = coreWith(
    makeFetch(() =>
      rdapBody({
        status: ["pending delete"],
        events: [
          { eventAction: "expiration", eventDate: "2026-01-01T00:00:00Z" },
          { eventAction: "last changed", eventDate: "2026-07-10T00:00:00Z" },
        ],
      }),
    ),
  );
  const r = await core.rawProvider.check("dropping.com");
  assert.equal(r.status, "deleting");
  assert.equal(r.bucket, "dropping");
  assert.equal(r.estimatedDropAt, "2026-07-15T00:00:00.000Z");
});

test("a 429 is retried and then resolves (fetch called more than once for the domain)", async () => {
  let hits = 0;
  const core = coreWith(
    makeFetch(() => {
      hits++;
      return hits === 1
        ? new Response("", { status: 429 })
        : new Response("", { status: 404 });
    }),
  );
  const r = await core.rawProvider.check("busy.com");
  assert.equal(r.status, "available");
  assert.equal(hits, 2, "the 429 forced exactly one retry");
});

test("a TLD with no known RDAP server is unknown, not a guess", async () => {
  const calls: string[] = [];
  const core = coreWith(makeFetch(() => new Response("", { status: 404 }), calls));
  const r = await core.rawProvider.check("whatever.co");
  assert.equal(r.status, "unknown");
  assert.equal(r.via, "rdap:no-server");
  assert.ok(!calls.some((u) => u.startsWith(REGISTRY + "domain/")));
});

test("a non-404/429/200 registry status is reported as unknown, never available", async () => {
  const core = coreWith(makeFetch(() => new Response("boom", { status: 500 })));
  const r = await core.rawProvider.check("brokenreg.com");
  assert.equal(r.status, "unknown");
});
