// Availability checking behind a small provider interface — now dependency-
// injected so it lives in the framework-free core.
//
// Implementation: RDAP (free, public, no key). Rather than proxy every lookup
// through rdap.org (which rate-limits aggressively and 404s on TLDs missing
// from its bootstrap — indistinguishable from "available"), we resolve each
// TLD to its authoritative registry RDAP server via the IANA bootstrap file,
// then query that server directly.
//
// Nothing here reaches for a global: fetch, the clock, and the cache all arrive
// as dependencies, so the same code is drivable from any surface and fully
// controllable in tests.

import { bucketFor, interpretRegistered, type RdapDomain } from "./rdap-status";
import type { AvailabilityResult, AvailabilityStatus } from "./types";
import type { CacheStore } from "./cache";
import { mapPool } from "./pool";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface AvailabilityProvider {
  readonly name: string;
  check(domain: string): Promise<AvailabilityResult>;
}

export type AvailabilityDeps = {
  fetch: FetchLike;
  now: () => Date;
  cache: CacheStore;
};

// --- TLD -> RDAP server resolution ------------------------------------------

const IANA_BOOTSTRAP = "https://data.iana.org/rdap/dns.json";
// Static registry data — safe to cache for a long time.
const BOOTSTRAP_TTL_SECONDS = 86_400;
const BOOTSTRAP_KEY = "iana:bootstrap";

// Popular TLDs that run RDAP but are absent from the IANA bootstrap file, which
// covers ~1199 of 1438 zones and skews heavily gTLD. The gap is ccTLDs — which
// is exactly what domain hacks rely on. Every endpoint here was verified to
// return 200 for a registered domain and 404 for a free one.
//
// Deliberately absent: .co, .es, .at, .gg — no reachable public RDAP endpoint
// found, so they honestly report "unknown" rather than guess.
const OVERRIDES: Record<string, string> = {
  io: "https://rdap.identitydigital.services/rdap/",
  me: "https://rdap.identitydigital.services/rdap/",
  sh: "https://rdap.identitydigital.services/rdap/",
  ac: "https://rdap.identitydigital.services/rdap/",
  de: "https://rdap.denic.de/",
  us: "https://rdap.nic.us/",
};

type Bootstrap = Map<string, string>; // tld (no dot) -> base url (trailing slash)

function ensureSlash(u: string): string {
  return u.endsWith("/") ? u : u + "/";
}

async function loadBootstrap(fetchFn: FetchLike): Promise<Bootstrap> {
  const map: Bootstrap = new Map();
  try {
    const res = await fetchFn(IANA_BOOTSTRAP, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = (await res.json()) as { services: [string[], string[]][] };
      for (const [tlds, urls] of data.services) {
        const base = urls.find((u) => u.startsWith("https")) ?? urls[0];
        if (!base) continue;
        for (const t of tlds) map.set(t.toLowerCase(), ensureSlash(base));
      }
    }
  } catch {
    // Network/parse failure — we still return overrides below.
  }
  for (const [t, u] of Object.entries(OVERRIDES)) {
    if (!map.has(t)) map.set(t, ensureSlash(u));
  }
  return map;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The raw RDAP provider. Resolves the TLD to a registry via the (cached) IANA
 * bootstrap, then queries it directly. No per-domain result caching here — that
 * is layered on separately by `withAvailabilityCache`, so the seam is explicit.
 */
export function createRdapProvider(deps: AvailabilityDeps): AvailabilityProvider {
  const { fetch: fetchFn, now, cache } = deps;

  // Per-instance in-flight dedup so a burst of concurrent checks triggers one
  // bootstrap load, not one per worker. NOT a module global: a fresh provider
  // (fresh createCore) starts with no in-flight load and, given a fresh cache,
  // reloads the bootstrap — which is what keeps cache state test-resettable.
  let inflight: Promise<Bootstrap> | null = null;

  async function getBootstrap(): Promise<Bootstrap> {
    const cached = (await cache.get(BOOTSTRAP_KEY)) as Bootstrap | undefined;
    if (cached) return cached;
    if (inflight) return inflight;
    inflight = (async () => {
      const map = await loadBootstrap(fetchFn);
      await cache.set(BOOTSTRAP_KEY, map, BOOTSTRAP_TTL_SECONDS);
      inflight = null;
      return map;
    })();
    return inflight;
  }

  function result(
    domain: string,
    status: AvailabilityStatus,
    via: string,
  ): AvailabilityResult {
    return {
      domain,
      status,
      bucket: bucketFor(status),
      via,
      checkedAt: now().toISOString(),
    };
  }

  async function queryRegistry(
    base: string,
    domain: string,
    attempt = 0,
  ): Promise<AvailabilityResult> {
    try {
      const res = await fetchFn(base + "domain/" + encodeURIComponent(domain), {
        headers: { accept: "application/rdap+json" },
        redirect: "follow",
        signal: AbortSignal.timeout(6000),
      });
      if (res.status === 404) return result(domain, "available", "rdap");
      if (res.status === 429 && attempt < 2) {
        await sleep(350 * (attempt + 1));
        return queryRegistry(base, domain, attempt + 1);
      }
      if (res.ok) {
        // Registered — but *how* registered matters. Parse the record for
        // redemption/pending-delete/parking signals.
        const body = (await res.json()) as RdapDomain;
        const info = interpretRegistered(body);
        return {
          domain,
          status: info.status,
          bucket: bucketFor(info.status),
          rawStatuses: info.rawStatuses,
          expiresAt: info.expiresAt,
          estimatedDropAt: info.estimatedDropAt,
          nameservers: info.nameservers,
          via: "rdap",
          checkedAt: now().toISOString(),
        };
      }
      return result(domain, "unknown", `rdap:${res.status}`);
    } catch {
      return result(domain, "unknown", "rdap:error");
    }
  }

  return {
    name: "rdap",
    async check(domain: string): Promise<AvailabilityResult> {
      const d = domain.toLowerCase().trim();
      const dot = d.lastIndexOf(".");
      if (dot < 0) return result(d, "unknown", "rdap:no-tld");
      const tld = d.slice(dot + 1);

      const bootstrap = await getBootstrap();
      const base = bootstrap.get(tld);
      // No known RDAP server for this TLD (e.g. .co) — we honestly can't tell.
      if (!base) return result(d, "unknown", "rdap:no-server");

      return queryRegistry(base, d);
    },
  };
}

// --- per-domain availability cache (the new behavior) -----------------------

export type AvailabilityCacheTtls = {
  /** TTL for "available" — kept VERY short: a stale "available" is the danger. */
  availableSeconds: number;
  /** TTL for a registered/taken/dropping result — safe to hold longer. */
  registeredSeconds: number;
};

export const DEFAULT_TTLS: AvailabilityCacheTtls = {
  availableSeconds: 60,
  registeredSeconds: 3_600,
};

/**
 * TTL for a result by its status. `unknown` (error/uncertain) is never cached —
 * caching "we couldn't tell" would pin a transient failure. `available` gets the
 * short TTL; everything else registered gets the long one.
 */
function ttlFor(status: AvailabilityStatus, ttls: AvailabilityCacheTtls): number {
  if (status === "unknown") return 0; // do not cache
  if (status === "available") return ttls.availableSeconds;
  return ttls.registeredSeconds;
}

/**
 * Wrap a provider with a read-through cache keyed by normalized domain. This is
 * the single seam where availability caching lives; pass `noopCache` to disable.
 */
export function withAvailabilityCache(
  inner: AvailabilityProvider,
  cache: CacheStore,
  ttls: AvailabilityCacheTtls = DEFAULT_TTLS,
): AvailabilityProvider {
  return {
    name: inner.name,
    async check(domain: string): Promise<AvailabilityResult> {
      const key = "avail:" + domain.toLowerCase().trim();
      const cached = (await cache.get(key)) as AvailabilityResult | undefined;
      if (cached) return cached;
      const fresh = await inner.check(domain);
      await cache.set(key, fresh, ttlFor(fresh.status, ttls));
      return fresh;
    },
  };
}

/**
 * Check many domains with a concurrency cap. Because different TLDs resolve to
 * different registry servers, per-server pressure stays low even at this cap.
 * Order of results matches input. Pure over the injected provider.
 */
export async function checkMany(
  domains: string[],
  concurrency: number,
  provider: AvailabilityProvider,
): Promise<AvailabilityResult[]> {
  return mapPool(domains, concurrency, (d) => provider.check(d));
}
