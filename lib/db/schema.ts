// Watchlist schema.
//
// The shape that matters here is the normalisation: RDAP state lives on
// `domains`, keyed by the domain itself — NOT on `watches`. A hundred people
// watching the same short .com is one row, one RDAP call, one transition. Load
// is proportional to *unique domains under observation* rather than
// users x domains, which is what keeps polling survivable on free-tier RDAP
// (registries don't sell capacity — see the wiki's gotchas page).
//
// `domains.next_check_at` is the due-queue: the cron polls only what's due.
// `watch_events` is the transition log and the source of truth for alerting;
// `alerts` dedupes delivery per (watch, event) so cron retries can't double-send.

import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Mirrors AvailabilityStatus / AvailabilityBucket in lib/types.ts. Kept in sync
// by the type assertions at the bottom of this file.
export const statusEnum = pgEnum("availability_status", [
  "available",
  "active",
  "parked",
  "expiring",
  "deleting",
  "reserved",
  "unknown",
]);

export const bucketEnum = pgEnum("availability_bucket", [
  "registrable",
  "dropping",
  "aftermarket",
  "unavailable",
  "unknown",
]);

export const watchStateEnum = pgEnum("watch_state", [
  "watching",
  "fired",
  "paused",
]);

/**
 * One row per domain under observation, regardless of how many people watch it.
 * This is the due-queue.
 */
export const domains = pgTable(
  "domains",
  {
    /** lowercased FQDN, e.g. "recip.es" — natural key, so watches need no join */
    domain: text("domain").primaryKey(),
    status: statusEnum("status").notNull(),
    bucket: bucketEnum("bucket").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    estimatedDropAt: timestamp("estimated_drop_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    /** when the poller should next look at this domain — the due-queue cursor */
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }).notNull(),
    /** consecutive failed/unknown checks, for backing off transient errors */
    failureCount: integer("failure_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("domains_next_check_at_idx").on(t.nextCheckAt)],
);

/**
 * A person's interest in a domain. No users table by design: identity is an
 * email plus an unguessable manage token (see the wiki's auth decision).
 */
export const watches = pgTable(
  "watches",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    email: text("email").notNull(),
    /** unguessable; the only credential — carried in alert/manage links */
    manageToken: text("manage_token").notNull().unique(),
    domain: text("domain")
      .notNull()
      .references(() => domains.domain, { onDelete: "cascade" }),
    state: watchStateEnum("state").notNull().default("watching"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("watches_email_domain_key").on(t.email, t.domain),
    index("watches_domain_idx").on(t.domain),
    index("watches_email_idx").on(t.email),
  ],
);

/**
 * The transition log — append-only, keyed on the domain rather than the watch,
 * because a transition is a fact about the world, not about one watcher.
 * `fromStatus` is null for the first observation.
 */
export const watchEvents = pgTable(
  "watch_events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    domain: text("domain")
      .notNull()
      .references(() => domains.domain, { onDelete: "cascade" }),
    fromStatus: statusEnum("from_status"),
    toStatus: statusEnum("to_status").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** the AvailabilityResult that produced this transition, for forensics */
    payload: jsonb("payload"),
  },
  (t) => [index("watch_events_domain_idx").on(t.domain, t.observedAt)],
);

/**
 * Delivery ledger. The unique constraint is the idempotency guarantee: a cron
 * retry re-deriving the same (watch, event) pair cannot send a second email.
 */
export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    watchId: uuid("watch_id")
      .notNull()
      .references(() => watches.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => watchEvents.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("email"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("alerts_watch_event_key").on(t.watchId, t.eventId)],
);

export type DomainRow = typeof domains.$inferSelect;
export type WatchRow = typeof watches.$inferSelect;
export type WatchEventRow = typeof watchEvents.$inferSelect;
