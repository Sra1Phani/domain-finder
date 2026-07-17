// Interpreting an RDAP domain response into our status taxonomy.
//
// RDAP hands back RFC 8056 status strings (EPP statuses, space-separated words),
// an `events` array (registration/expiration/last changed), and `nameservers`.
// Together these give us most of Domainr's taxonomy for free — everything except
// true aftermarket pricing, which needs a paid source.

import type { AvailabilityBucket, AvailabilityStatus } from "./types";

export type RdapDomain = {
  status?: string[];
  events?: { eventAction?: string; eventDate?: string }[];
  nameservers?: { ldhName?: string }[];
};

/**
 * Nameservers that indicate a domain is parked / listed for sale. Deliberately
 * conservative: only marketplace and dedicated parking providers. Generic
 * registrar DNS (e.g. GoDaddy's domaincontrol.com, Namecheap's
 * registrar-servers.com) is NOT included — those host plenty of real sites and
 * would produce false "for sale" signals.
 *
 * KNOWN LIMITATION: this catches far fewer for-sale domains than you'd expect.
 * Spot-checking real premium/marketplace domains (including hugedomains.com
 * itself) found them behind Cloudflare or AWS rather than parking nameservers,
 * so the NS signal is invisible. Treat "parked" as a high-precision/low-recall
 * hint: when it fires it's meaningful, but absence proves nothing. Reliable
 * for-sale detection needs an aftermarket data source — which is precisely what
 * the paid Fastly/Domainr "estimated" status endpoint sells.
 */
const PARKING_NS = [
  "sedoparking.com",
  "bodis.com",
  "parkingcrew.net",
  "afternic.com",
  "dan.com",
  "hugedomains.com",
  "above.com",
  "cashparking.com",
  "sav.com",
  "fabulous.com",
  "undeveloped.com",
  "voodoo.com",
  "parklogic.com",
  "domainmarket.com",
];

/** Pending-delete is a fixed 5-day window before the domain is released. */
const PENDING_DELETE_DAYS = 5;

function has(statuses: string[], needle: string): boolean {
  return statuses.some((s) => s.toLowerCase().includes(needle));
}

function eventDate(d: RdapDomain, action: string): string | undefined {
  return d.events?.find((e) => e.eventAction === action)?.eventDate;
}

export function nameservers(d: RdapDomain): string[] {
  return (d.nameservers ?? [])
    .map((n) => n.ldhName?.toLowerCase())
    .filter((n): n is string => Boolean(n));
}

export function isParked(ns: string[]): boolean {
  return ns.some((host) => PARKING_NS.some((p) => host.endsWith(p)));
}

export function bucketFor(status: AvailabilityStatus): AvailabilityBucket {
  switch (status) {
    case "available":
      return "registrable";
    case "expiring":
    case "deleting":
      return "dropping";
    case "parked":
      return "aftermarket";
    case "active":
    case "reserved":
      return "unavailable";
    case "unknown":
      return "unknown";
  }
}

export type Interpreted = {
  status: AvailabilityStatus;
  rawStatuses: string[];
  expiresAt?: string;
  estimatedDropAt?: string;
  nameservers: string[];
};

/**
 * Interpret a registered domain's RDAP record. Precedence runs most- to
 * least-severe: a domain in pendingDelete is "deleting" even though it also
 * carries transfer-prohibited flags.
 */
export function interpretRegistered(d: RdapDomain): Interpreted {
  const rawStatuses = (d.status ?? []).map((s) => s.toLowerCase());
  const ns = nameservers(d);
  const expiresAt = eventDate(d, "expiration");

  let status: AvailabilityStatus;
  let estimatedDropAt: string | undefined;

  if (has(rawStatuses, "pending delete")) {
    status = "deleting";
    // The 5-day clock starts when the status was set; "last changed" is our
    // best available proxy for that. Explicitly an estimate.
    const changed = eventDate(d, "last changed");
    if (changed) {
      const t = Date.parse(changed);
      if (!Number.isNaN(t)) {
        estimatedDropAt = new Date(
          t + PENDING_DELETE_DAYS * 86_400_000,
        ).toISOString();
      }
    }
  } else if (has(rawStatuses, "redemption period")) {
    status = "expiring";
  } else if (has(rawStatuses, "reserved")) {
    status = "reserved";
  } else if (isParked(ns)) {
    status = "parked";
  } else {
    status = "active";
  }

  return { status, rawStatuses, expiresAt, estimatedDropAt, nameservers: ns };
}
