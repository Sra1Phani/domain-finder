// Creating and managing watches.
//
// Identity here is an email plus an unguessable manage token — no accounts, no
// sessions, no users table. The token is the only credential: it rides in alert
// links and is what the manage page authenticates with.

import { randomBytes } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, type Db } from "./db";
import { domains, watchEvents, watches } from "./db/schema";
import { availabilityProvider } from "./core";
import { nextCheckAt, type AvailabilityResult } from "@domain-finder/core";

/** Free tier. One domain is a demo; three is a habit. */
export const FREE_WATCH_LIMIT = 3;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export type CreateResult =
  | { ok: true; manageToken: string; domain: string; status: AvailabilityResult }
  | { ok: false; error: string; code: CreateErrorCode };

export type CreateErrorCode =
  | "invalid_email"
  | "invalid_domain"
  | "unobservable_tld"
  | "limit_reached"
  | "already_watching";

export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Create a watch, checking the domain once up front.
 *
 * The interesting rule is `unobservable_tld`. RDAP has no server for some TLDs
 * (.co, .es, .at, .gg — see the wiki's gotchas), and the app already reports
 * those honestly as `unknown` rather than guessing. A watch on such a domain
 * could never fire: we'd poll forever and learn nothing. So we refuse at
 * creation and say why, instead of accepting the watch and silently never
 * alerting — which would be the worst possible failure, because it looks
 * exactly like "nothing has happened yet".
 */
export async function createWatch(
  emailRaw: string,
  domainRaw: string,
  opts: { db?: Db; now?: Date } = {},
): Promise<CreateResult> {
  const db = opts.db ?? getDb();
  const now = opts.now ?? new Date();

  const email = emailRaw.trim().toLowerCase();
  const domain = normalizeDomain(domainRaw);

  if (!EMAIL_RE.test(email)) {
    return { ok: false, code: "invalid_email", error: "That doesn't look like an email address." };
  }
  if (!DOMAIN_RE.test(domain)) {
    return { ok: false, code: "invalid_domain", error: "That doesn't look like a domain name." };
  }

  const existing = await db
    .select({ token: watches.manageToken })
    .from(watches)
    .where(and(eq(watches.email, email), eq(watches.domain, domain)));
  if (existing.length > 0) {
    return {
      ok: false,
      code: "already_watching",
      error: "You're already watching that domain.",
    };
  }

  const mine = await db
    .select({ id: watches.id })
    .from(watches)
    .where(and(eq(watches.email, email), eq(watches.state, "watching")));
  if (mine.length >= FREE_WATCH_LIMIT) {
    return {
      ok: false,
      code: "limit_reached",
      error: `Free watches are capped at ${FREE_WATCH_LIMIT} domains.`,
    };
  }

  const known = await db.select().from(domains).where(eq(domains.domain, domain));
  let status: AvailabilityResult;

  if (known.length > 0) {
    // Someone else already watches this domain — reuse the observation rather
    // than spending an RDAP call to learn what we already know.
    const row = known[0];
    status = {
      domain,
      status: row.status,
      bucket: row.bucket,
      expiresAt: row.expiresAt?.toISOString(),
      estimatedDropAt: row.estimatedDropAt?.toISOString(),
      via: "cache",
      checkedAt: (row.lastCheckedAt ?? row.createdAt).toISOString(),
    };
  } else {
    status = await availabilityProvider.check(domain);

    if (status.via === "rdap:no-server" || status.via === "rdap:no-tld") {
      const tld = domain.slice(domain.lastIndexOf("."));
      return {
        ok: false,
        code: "unobservable_tld",
        error: `We can't monitor ${tld} domains — no public RDAP server exists for that zone, so we'd never be able to tell you when it changes.`,
      };
    }

    await db.insert(domains).values({
      domain,
      status: status.status,
      bucket: status.bucket,
      expiresAt: status.expiresAt ? new Date(status.expiresAt) : null,
      estimatedDropAt: status.estimatedDropAt ? new Date(status.estimatedDropAt) : null,
      lastCheckedAt: now,
      nextCheckAt: nextCheckAt(
        {
          status: status.status,
          expiresAt: status.expiresAt,
          estimatedDropAt: status.estimatedDropAt,
        },
        now,
      ),
    });

    // Seed the timeline with the first observation (fromStatus null), so the
    // manage page has a starting point rather than an empty history.
    await db.insert(watchEvents).values({
      domain,
      fromStatus: null,
      toStatus: status.status,
      payload: status,
      observedAt: now,
    });
  }

  const manageToken = newToken();
  await db.insert(watches).values({ email, domain, manageToken });

  return { ok: true, manageToken, domain, status };
}

export type WatchDetail = {
  domain: string;
  email: string;
  state: "watching" | "fired" | "paused";
  createdAt: Date;
  current: {
    status: string;
    bucket: string;
    expiresAt: Date | null;
    estimatedDropAt: Date | null;
    lastCheckedAt: Date | null;
    nextCheckAt: Date;
  };
  timeline: { fromStatus: string | null; toStatus: string; observedAt: Date }[];
  /** every domain this email watches, for the manage page */
  siblings: { domain: string; status: string; manageToken: string }[];
};

/** Look up a watch by its manage token. The token is the credential. */
export async function getWatchByToken(
  token: string,
  opts: { db?: Db } = {},
): Promise<WatchDetail | null> {
  const db = opts.db ?? getDb();

  const rows = await db
    .select({ watch: watches, domain: domains })
    .from(watches)
    .innerJoin(domains, eq(watches.domain, domains.domain))
    .where(eq(watches.manageToken, token));

  if (rows.length === 0) return null;
  const { watch, domain } = rows[0];

  const timeline = await db
    .select({
      fromStatus: watchEvents.fromStatus,
      toStatus: watchEvents.toStatus,
      observedAt: watchEvents.observedAt,
    })
    .from(watchEvents)
    .where(eq(watchEvents.domain, watch.domain))
    .orderBy(desc(watchEvents.observedAt));

  const siblings = await db
    .select({
      domain: watches.domain,
      status: domains.status,
      manageToken: watches.manageToken,
    })
    .from(watches)
    .innerJoin(domains, eq(watches.domain, domains.domain))
    .where(eq(watches.email, watch.email))
    .orderBy(asc(watches.createdAt));

  return {
    domain: watch.domain,
    email: watch.email,
    state: watch.state,
    createdAt: watch.createdAt,
    current: {
      status: domain.status,
      bucket: domain.bucket,
      expiresAt: domain.expiresAt,
      estimatedDropAt: domain.estimatedDropAt,
      lastCheckedAt: domain.lastCheckedAt,
      nextCheckAt: domain.nextCheckAt,
    },
    timeline,
    siblings,
  };
}

export async function deleteWatchByToken(
  token: string,
  opts: { db?: Db } = {},
): Promise<boolean> {
  const db = opts.db ?? getDb();
  const gone = await db
    .delete(watches)
    .where(eq(watches.manageToken, token))
    .returning({ id: watches.id });
  return gone.length > 0;
}
