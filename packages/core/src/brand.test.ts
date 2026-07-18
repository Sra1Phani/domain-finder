// checkBrand composition — runs the domain check and the cross-namespace check
// and merges them. Deterministic: fake fetch routes RDAP + the three registries.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  checkBrand,
  createCore,
  DEFAULT_BRAND_SURFACES,
  DEFAULT_BRAND_TLDS,
  type FetchLike,
} from "./index";

const IANA_BOOTSTRAP = "https://data.iana.org/rdap/dns.json";
const REGISTRY = "https://rdap.test/";

// RDAP for .com/.io/.dev/.app/.ai via one fake registry; the three namespace
// registries answer by host. github/npm free, pypi taken — an arbitrary mix.
const fetchFn: FetchLike = async (url) => {
  if (url === IANA_BOOTSTRAP) {
    return new Response(
      JSON.stringify({
        services: [[["com", "io", "dev", "app", "ai"], [REGISTRY]]],
      }),
      { status: 200 },
    );
  }
  if (url.startsWith(REGISTRY + "domain/")) {
    const d = decodeURIComponent(url.slice((REGISTRY + "domain/").length));
    if (d === "acme.com") {
      // A registered domain returns a real RDAP record (200 with a body).
      return new Response(
        JSON.stringify({
          status: ["client transfer prohibited"],
          events: [{ eventAction: "expiration", eventDate: "2030-01-01T00:00:00Z" }],
        }),
        { status: 200 },
      );
    }
    return new Response("", { status: 404 });
  }
  if (url.startsWith("https://registry.npmjs.org/")) return new Response("", { status: 404 });
  if (url.startsWith("https://pypi.org/pypi/")) return new Response("", { status: 200 });
  if (url.startsWith("https://api.github.com/users/")) return new Response("", { status: 404 });
  return new Response("", { status: 404 });
};

test("checkBrand composes domain + namespace results with sensible defaults", async () => {
  const core = createCore({ fetch: fetchFn });
  const brand = await core.checkBrand("acme");

  assert.equal(brand.name, "acme");
  // One domain result per default TLD, checked as acme.<tld>.
  assert.equal(brand.domains.length, DEFAULT_BRAND_TLDS.length);
  assert.deepEqual(
    brand.domains.map((d) => d.domain).sort(),
    DEFAULT_BRAND_TLDS.map((t) => `acme.${t}`).sort(),
  );
  // acme.com scripted taken, the rest available.
  const com = brand.domains.find((d) => d.domain === "acme.com")!;
  assert.equal(com.status, "active");
  assert.ok(brand.domains.filter((d) => d.status === "available").length >= 1);

  // One namespace result per default surface.
  assert.equal(brand.namespaces.length, DEFAULT_BRAND_SURFACES.length);
  const bySurface = new Map(brand.namespaces.map((n) => [n.surface, n]));
  assert.equal(bySurface.get("github")!.status, "available");
  assert.equal(bySurface.get("npm")!.status, "available");
  assert.equal(bySurface.get("pypi")!.status, "taken");
});

test("checkBrand honors explicit tlds/surfaces and strips a leading dot", async () => {
  const core = createCore({ fetch: fetchFn });
  const brand = await core.checkBrand("acme", { tlds: [".com", "io"], surfaces: ["npm"] });

  assert.deepEqual(brand.domains.map((d) => d.domain).sort(), ["acme.com", "acme.io"]);
  assert.deepEqual(brand.namespaces.map((n) => n.surface), ["npm"]);
});

test("the standalone checkBrand fans out over its injected collaborators", async () => {
  const seenDomains: string[][] = [];
  const seenNs: Array<[string, string[]]> = [];
  const brand = await checkBrand(
    "acme",
    { tlds: ["com"], surfaces: ["github", "npm"] },
    {
      checkDomains: async (domains) => {
        seenDomains.push(domains);
        return domains.map((domain) => ({
          domain,
          status: "available" as const,
          bucket: "registrable" as const,
          via: "fake",
          checkedAt: "t",
        }));
      },
      checkNamespaces: async (name, surfaces) => {
        seenNs.push([name, surfaces]);
        return surfaces.map((surface) => ({
          surface,
          name,
          normalized: name,
          status: "available" as const,
          checkedAt: "t",
        }));
      },
    },
  );

  assert.deepEqual(seenDomains, [["acme.com"]]);
  assert.deepEqual(seenNs, [["acme", ["github", "npm"]]]);
  assert.equal(brand.domains.length, 1);
  assert.equal(brand.namespaces.length, 2);
});
