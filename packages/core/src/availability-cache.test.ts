// Tests for the ONE new behavior added by the extraction: per-domain
// availability caching at the provider seam, with TTL keyed on the result's
// status. The cache clock is injected, so TTL expiry is exact.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createCore, createMemoryCache, noopCache, type FetchLike } from "./index";

const IANA_BOOTSTRAP = "https://data.iana.org/rdap/dns.json";
const REGISTRY = "https://rdap.test/";

// A fake fetch that counts per-domain registry queries (bootstrap excluded).
function countingFetch(perDomain: (domain: string) => Response) {
  const domainHits: Record<string, number> = {};
  const fetchFn: FetchLike = async (url) => {
    if (url === IANA_BOOTSTRAP) {
      return new Response(JSON.stringify({ services: [[["com"], [REGISTRY]]] }), {
        status: 200,
      });
    }
    if (url.startsWith(REGISTRY + "domain/")) {
      const domain = decodeURIComponent(url.slice((REGISTRY + "domain/").length));
      domainHits[domain] = (domainHits[domain] ?? 0) + 1;
      return perDomain(domain);
    }
    return new Response("", { status: 404 });
  };
  return { fetchFn, domainHits };
}

const AVAILABLE = () => new Response("", { status: 404 });
const TAKEN = () =>
  new Response(
    JSON.stringify({
      status: ["client transfer prohibited"],
      events: [{ eventAction: "expiration", eventDate: "2030-01-01T00:00:00Z" }],
    }),
    { status: 200 },
  );

// Build a core whose availability cache runs on a controllable clock.
function cachedCore(fetchFn: FetchLike, clockMs: () => number) {
  return createCore({
    fetch: fetchFn,
    now: () => new Date(clockMs()),
    cache: createMemoryCache(clockMs),
  });
}

test("a repeat check hits the cache — the registry is queried once", async () => {
  const t = 1_000_000;
  const { fetchFn, domainHits } = countingFetch(TAKEN);
  const core = cachedCore(fetchFn, () => t);

  await core.check("repeat.com");
  await core.check("repeat.com");

  assert.equal(domainHits["repeat.com"], 1, "second check served from cache");
});

test("'available' honors the short TTL and is re-checked after it expires", async () => {
  let t = 1_000_000;
  const { fetchFn, domainHits } = countingFetch(AVAILABLE);
  const core = cachedCore(fetchFn, () => t);

  const first = await core.check("free.com");
  assert.equal(first.status, "available");
  await core.check("free.com"); // within TTL -> cached
  assert.equal(domainHits["free.com"], 1);

  t += 61_000; // past the default 60s available TTL
  await core.check("free.com");
  assert.equal(domainHits["free.com"], 2, "a stale 'available' must not persist");
});

test("'taken' persists across the short-TTL window", async () => {
  let t = 1_000_000;
  const { fetchFn, domainHits } = countingFetch(TAKEN);
  const core = cachedCore(fetchFn, () => t);

  await core.check("owned.com");
  t += 61_000; // past the available TTL, but well within the registered TTL (1h)
  await core.check("owned.com");

  assert.equal(domainHits["owned.com"], 1, "a taken domain stays cached");
});

test("an 'unknown' result is never cached", async () => {
  const t = 1_000_000;
  const { fetchFn, domainHits } = countingFetch(() => new Response("boom", { status: 500 }));
  const core = cachedCore(fetchFn, () => t);

  const r1 = await core.check("flaky.com");
  const r2 = await core.check("flaky.com");

  assert.equal(r1.status, "unknown");
  assert.equal(r2.status, "unknown");
  assert.equal(domainHits["flaky.com"], 2, "uncertain results are re-queried, not pinned");
});

test("the no-op cache disables caching entirely", async () => {
  const { fetchFn, domainHits } = countingFetch(TAKEN);
  const core = createCore({ fetch: fetchFn, cache: noopCache });

  await core.check("nocache.com");
  await core.check("nocache.com");

  assert.equal(domainHits["nocache.com"], 2, "every check is fresh with noopCache");
});

test("rawProvider bypasses the per-domain cache (fresh every time)", async () => {
  const t = 1_000_000;
  const { fetchFn, domainHits } = countingFetch(TAKEN);
  const core = cachedCore(fetchFn, () => t);

  await core.rawProvider.check("raw.com");
  await core.rawProvider.check("raw.com");

  assert.equal(domainHits["raw.com"], 2, "the poller's uncached path stays fresh");
});
