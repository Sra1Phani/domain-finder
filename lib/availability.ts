// Availability checking behind a small provider interface.
//
// Implementation: RDAP (free, public, no key). Rather than proxy every lookup
// through rdap.org (which rate-limits aggressively and 404s on TLDs missing
// from its bootstrap — indistinguishable from "available"), we resolve each
// TLD to its authoritative registry RDAP server via the IANA bootstrap file,
// then query that server directly. This spreads load across registries and
// makes a 404 an unambiguous "available".
//
// The provider interface exists so a paid registrar provider (pricing + buy
// links) can be dropped in later without touching generation/ranking/routing.

import type { AvailabilityResult, AvailabilityStatus } from "./types";
import { bucketFor, interpretRegistered, type RdapDomain } from "./rdap-status";

export interface AvailabilityProvider {
  readonly name: string;
  check(domain: string): Promise<AvailabilityResult>;
}

// --- TLD -> RDAP server resolution ------------------------------------------

const IANA_BOOTSTRAP = "https://data.iana.org/rdap/dns.json";

// Popular TLDs that run RDAP but are absent from the IANA bootstrap file, which
// covers ~1199 of 1438 zones and skews heavily gTLD. The gap is ccTLDs — which
// is exactly what domain hacks rely on, so these matter more than the count
// suggests. Every endpoint here was verified to return 200 for a registered
// domain and 404 for a free one.
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

let bootstrapPromise: Promise<Bootstrap> | null = null;

async function loadBootstrap(): Promise<Bootstrap> {
  const map: Bootstrap = new Map();
  try {
    const res = await fetch(IANA_BOOTSTRAP, {
      signal: AbortSignal.timeout(6000),
    });
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

function getBootstrap(): Promise<Bootstrap> {
  return (bootstrapPromise ??= loadBootstrap());
}

// --- RDAP provider -----------------------------------------------------------

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
    checkedAt: new Date().toISOString(),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function queryRegistry(
  base: string,
  domain: string,
  attempt = 0,
): Promise<AvailabilityResult> {
  try {
    const res = await fetch(base + "domain/" + encodeURIComponent(domain), {
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
        checkedAt: new Date().toISOString(),
      };
    }
    return result(domain, "unknown", `rdap:${res.status}`);
  } catch {
    return result(domain, "unknown", "rdap:error");
  }
}

export const rdapProvider: AvailabilityProvider = {
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

// --- default provider + bounded-concurrency batch ---------------------------

export const availabilityProvider: AvailabilityProvider = rdapProvider;

/**
 * Check many domains with a concurrency cap. Because different TLDs resolve to
 * different registry servers, per-server pressure stays low even at this cap.
 * Order of results matches input.
 */
export async function checkMany(
  domains: string[],
  concurrency = 6,
  provider: AvailabilityProvider = availabilityProvider,
): Promise<AvailabilityResult[]> {
  const out = new Array<AvailabilityResult>(domains.length);
  let cursor = 0;

  async function worker() {
    while (cursor < domains.length) {
      const i = cursor++;
      out[i] = await provider.check(domains[i]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, domains.length) },
    worker,
  );
  await Promise.all(workers);
  return out;
}
