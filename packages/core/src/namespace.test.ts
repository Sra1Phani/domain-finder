// Per-provider tests for cross-namespace availability. Deterministic: fake
// fetch + fixed clock, no real network. The load-bearing assertions are the
// degrade cases — a false "available" is the dangerous output.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  githubProvider,
  npmProvider,
  pypiProvider,
  type NamespaceDeps,
} from "./index";
import type { FetchLike } from "./index";

const NOW = () => new Date("2026-07-18T00:00:00Z");

// Build deps whose fetch returns a scripted response for the first (only) call,
// and records the URLs hit.
function depsReturning(
  responder: (url: string) => Response | Promise<Response>,
  extra: Partial<NamespaceDeps> = {},
): { deps: NamespaceDeps; calls: string[] } {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    return responder(url);
  };
  return { deps: { fetch, now: NOW, ...extra }, calls };
}

const res = (status: number, headers?: Record<string, string>) =>
  new Response("", { status, headers });

// --- npm ---------------------------------------------------------------------

test("npm: 404 => available, lowercased, with the package url", async () => {
  const { deps, calls } = depsReturning(() => res(404));
  const r = await npmProvider.check("MyPkg", deps);
  assert.equal(r.status, "available");
  assert.equal(r.normalized, "mypkg");
  assert.equal(r.url, "https://www.npmjs.com/package/mypkg");
  assert.equal(r.surface, "npm");
  assert.equal(r.name, "MyPkg");
  assert.equal(calls[0], "https://registry.npmjs.org/mypkg");
});

test("npm: 200 => taken", async () => {
  const { deps } = depsReturning(() => res(200));
  const r = await npmProvider.check("react", deps);
  assert.equal(r.status, "taken");
  assert.equal(r.url, "https://www.npmjs.com/package/react");
});

test("npm: 500 => unknown, never available, and no url claimed", async () => {
  const { deps } = depsReturning(() => res(500));
  const r = await npmProvider.check("react", deps);
  assert.equal(r.status, "unknown");
  assert.equal(r.url, undefined);
});

test("npm: a network error => unknown", async () => {
  const deps: NamespaceDeps = {
    now: NOW,
    fetch: async () => {
      throw new Error("ECONNRESET");
    },
  };
  const r = await npmProvider.check("react", deps);
  assert.equal(r.status, "unknown");
});

// --- PyPI --------------------------------------------------------------------

test("pypi: PEP 503 normalization (lowercase; runs of -_. collapse to one -)", async () => {
  const { deps, calls } = depsReturning(() => res(404));
  const r = await pypiProvider.check("Foo._-.Bar__Baz", deps);
  assert.equal(r.normalized, "foo-bar-baz");
  assert.equal(r.status, "available");
  assert.equal(r.url, "https://pypi.org/project/foo-bar-baz/");
  assert.equal(calls[0], "https://pypi.org/pypi/foo-bar-baz/json");
});

test("pypi: 200 => taken", async () => {
  const { deps } = depsReturning(() => res(200));
  const r = await pypiProvider.check("numpy", deps);
  assert.equal(r.status, "taken");
});

test("pypi: 503 => unknown, never available", async () => {
  const { deps } = depsReturning(() => res(503));
  const r = await pypiProvider.check("numpy", deps);
  assert.equal(r.status, "unknown");
});

// --- GitHub ------------------------------------------------------------------

test("github: 404 => available with the profile url", async () => {
  const { deps } = depsReturning(() => res(404));
  const r = await githubProvider.check("octonewbie", deps);
  assert.equal(r.status, "available");
  assert.equal(r.url, "https://github.com/octonewbie");
});

test("github: 200 => taken (the /users endpoint covers users and orgs)", async () => {
  const { deps } = depsReturning(() => res(200));
  const r = await githubProvider.check("github", deps);
  assert.equal(r.status, "taken");
});

test("github: an invalid login short-circuits WITHOUT calling the API", async () => {
  const { deps, calls } = depsReturning(() => res(404));
  // Leading hyphen, and consecutive hyphens — both illegal.
  const bad = await githubProvider.check("-bad--name", deps);
  assert.equal(bad.status, "invalid");
  assert.equal(bad.url, undefined, "invalid names claim no location");
  assert.equal(calls.length, 0, "no network call for an invalid name");

  // Over 39 chars is invalid too.
  const tooLong = await githubProvider.check("a".repeat(40), deps);
  assert.equal(tooLong.status, "invalid");
  assert.equal(calls.length, 0);
});

test("github: a 403 with X-RateLimit-Remaining:0 => unknown, NOT available (the trap)", async () => {
  const { deps } = depsReturning(() =>
    res(403, { "x-ratelimit-remaining": "0" }),
  );
  const r = await githubProvider.check("someone", deps);
  assert.equal(r.status, "unknown", "a throttle must never read as a free handle");
});

test("github: a 429 throttle => unknown", async () => {
  const { deps } = depsReturning(() =>
    res(429, { "x-ratelimit-remaining": "0" }),
  );
  const r = await githubProvider.check("someone", deps);
  assert.equal(r.status, "unknown");
});

test("github: an injected token is sent as an Authorization header", async () => {
  let seen: HeadersInit | undefined;
  const deps: NamespaceDeps = {
    now: NOW,
    githubToken: "ghp_secret",
    fetch: async (_url, init) => {
      seen = init?.headers;
      return res(404);
    },
  };
  await githubProvider.check("octonewbie", deps);
  const auth = (seen as Record<string, string>).authorization;
  assert.equal(auth, "Bearer ghp_secret");
});

test("github: with no token, no Authorization header is sent", async () => {
  let seen: Record<string, string> | undefined;
  const deps: NamespaceDeps = {
    now: NOW,
    fetch: async (_url, init) => {
      seen = init?.headers as Record<string, string>;
      return res(404);
    },
  };
  await githubProvider.check("octonewbie", deps);
  assert.equal(seen?.authorization, undefined);
});

test("github: a reserved login is invalid WITHOUT calling the API (no false available)", async () => {
  const { deps, calls } = depsReturning(() => res(404)); // API would say "available"
  for (const reserved of ["settings", "about", "Security", "PRICING"]) {
    const r = await githubProvider.check(reserved, deps);
    assert.equal(r.status, "invalid", `${reserved} must be invalid, not available`);
  }
  assert.equal(calls.length, 0, "reserved names never hit the API");
});

test("npm: scoped input (@scope/name or containing a slash) is invalid, no API call", async () => {
  const { deps, calls } = depsReturning(() => res(404));
  const scoped = await npmProvider.check("@angular/core", deps);
  assert.equal(scoped.status, "invalid");
  const slashed = await npmProvider.check("foo/bar", deps);
  assert.equal(slashed.status, "invalid");
  assert.equal(calls.length, 0, "scoped names never hit the registry");
});
