// Coordinator + cache tests: fan-out across surfaces, merge to NamespaceResult[],
// and the cache TTL-by-status policy. Deterministic — fake fetch, injected clock.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createCore, createMemoryCache, noopCache, type FetchLike } from "./index";

const NPM = "https://registry.npmjs.org/";
const PYPI_PREFIX = "https://pypi.org/pypi/";
const GH = "https://api.github.com/users/";

type Script = { npm?: number; pypi?: number; github?: number };

// A fake fetch that answers each surface with a scripted status and counts hits.
function scriptedFetch(script: Script) {
  const hits = { npm: 0, pypi: 0, github: 0 };
  const fetchFn: FetchLike = async (url) => {
    if (url.startsWith(NPM)) {
      hits.npm++;
      return new Response("", { status: script.npm ?? 404 });
    }
    if (url.startsWith(PYPI_PREFIX)) {
      hits.pypi++;
      return new Response("", { status: script.pypi ?? 404 });
    }
    if (url.startsWith(GH)) {
      hits.github++;
      return new Response("", { status: script.github ?? 404 });
    }
    return new Response("", { status: 404 });
  };
  return { fetchFn, hits };
}

function cachedCore(fetchFn: FetchLike, clockMs: () => number) {
  return createCore({
    fetch: fetchFn,
    now: () => new Date(clockMs()),
    cache: createMemoryCache(clockMs),
  });
}

test("checkNamespaces fans out across surfaces and merges to NamespaceResult[]", async () => {
  const { fetchFn } = scriptedFetch({ github: 404, npm: 200, pypi: 404 });
  const core = createCore({ fetch: fetchFn });

  const results = await core.checkNamespaces("mylabel");

  assert.equal(results.length, 3);
  const bySurface = new Map(results.map((r) => [r.surface, r]));
  assert.equal(bySurface.get("github")!.status, "available");
  assert.equal(bySurface.get("npm")!.status, "taken");
  assert.equal(bySurface.get("pypi")!.status, "available");
  // Every result carries the contract shape.
  for (const r of results) {
    assert.ok(["surface", "name", "normalized", "status", "checkedAt"].every((k) => k in r));
    assert.equal(r.name, "mylabel");
  }
});

test("a subset of surfaces is honored, in order", async () => {
  const { fetchFn, hits } = scriptedFetch({});
  const core = createCore({ fetch: fetchFn });
  const results = await core.checkNamespaces("x", ["pypi", "github"]);
  assert.deepEqual(results.map((r) => r.surface), ["pypi", "github"]);
  assert.equal(hits.npm, 0, "npm was not requested");
});

test("a repeat check hits the cache — each surface is queried once", async () => {
  const t = 1_000_000;
  const { fetchFn, hits } = scriptedFetch({ npm: 200, pypi: 200, github: 200 });
  const core = cachedCore(fetchFn, () => t);

  await core.checkNamespaces("dup");
  await core.checkNamespaces("dup");

  assert.deepEqual(hits, { npm: 1, pypi: 1, github: 1 });
});

test("'available' honors the short TTL; 'taken' persists across it", async () => {
  let t = 1_000_000;
  // npm available (404), pypi taken (200).
  const { fetchFn, hits } = scriptedFetch({ npm: 404, pypi: 200 });
  const core = cachedCore(fetchFn, () => t);

  await core.checkNamespaces("lbl", ["npm", "pypi"]);
  assert.deepEqual(hits, { npm: 1, pypi: 1, github: 0 });

  t += 61_000; // past the 60s available TTL, well within the 3600s taken TTL
  await core.checkNamespaces("lbl", ["npm", "pypi"]);

  assert.equal(hits.npm, 2, "a stale 'available' must be re-checked");
  assert.equal(hits.pypi, 1, "a 'taken' name stays cached");
});

test("'unknown' is never cached", async () => {
  const t = 1_000_000;
  const { fetchFn, hits } = scriptedFetch({ npm: 500 });
  const core = cachedCore(fetchFn, () => t);

  const a = await core.checkNamespaces("lbl", ["npm"]);
  const b = await core.checkNamespaces("lbl", ["npm"]);

  assert.equal(a[0].status, "unknown");
  assert.equal(b[0].status, "unknown");
  assert.equal(hits.npm, 2, "uncertain results are re-queried");
});

test("the no-op cache disables namespace caching entirely", async () => {
  const { fetchFn, hits } = scriptedFetch({ npm: 200 });
  const core = createCore({ fetch: fetchFn, cache: noopCache });

  await core.checkNamespaces("lbl", ["npm"]);
  await core.checkNamespaces("lbl", ["npm"]);

  assert.equal(hits.npm, 2, "every check is fresh with noopCache");
});

test("the cache key uses the normalized name (pypi variants share one entry)", async () => {
  const t = 1_000_000;
  const { fetchFn, hits } = scriptedFetch({ pypi: 200 });
  const core = cachedCore(fetchFn, () => t);

  // "Foo.Bar" and "foo-bar" both normalize to "foo-bar" under PEP 503.
  await core.checkNamespaces("Foo.Bar", ["pypi"]);
  await core.checkNamespaces("foo-bar", ["pypi"]);

  assert.equal(hits.pypi, 1, "normalized-equal names share a cache entry");
});
