// End-to-end tests for the poller, against a real database and a fake
// availability provider.
//
// The fake is the point. `redemptionPeriod` and `pendingDelete` are the two
// states the watchlist exists to catch, and they're rare enough that you cannot
// go and find one when you want to test. Everything downstream of the RDAP call
// — transition detection, alert selection, dedupe, cadence, terminality — is
// ours, so it's testable the moment the provider is injectable.
//
// Skips when DATABASE_URL isn't set, so `npm test` still passes on a clean
// checkout with no Postgres.

import { strict as assert } from "node:assert";
import { after, before, beforeEach, describe, test } from "node:test";
import { and, eq, like } from "drizzle-orm";
import { getDb, hasDatabase } from "./db";
import { alerts, domains, watchEvents, watches } from "./db/schema";
import { pollDue } from "./poll";
import {
  HOUR,
  type AvailabilityResult,
  type AvailabilityStatus,
} from "@domain-finder/core";
import type { AvailabilityProvider } from "@domain-finder/core";

const PREFIX = "polltest-";
const DOMAIN = `${PREFIX}drop.com`;
const NOW = new Date("2026-07-17T12:00:00Z");

/** A provider that reports whatever the test says, without touching the network. */
function fake(over: Partial<AvailabilityResult> & { status: AvailabilityStatus }): AvailabilityProvider {
  return {
    name: "fake",
    async check(domain: string): Promise<AvailabilityResult> {
      return {
        domain,
        bucket: "unavailable",
        via: "fake",
        checkedAt: NOW.toISOString(),
        ...over,
      };
    },
  };
}

describe("pollDue", { skip: !hasDatabase() && "DATABASE_URL not set" }, () => {
  const db = hasDatabase() ? getDb() : null!;

  async function cleanup() {
    const rows = await db.select({ domain: domains.domain }).from(domains).where(like(domains.domain, `${PREFIX}%`));
    for (const { domain } of rows) {
      await db.delete(domains).where(eq(domains.domain, domain)); // cascades
    }
  }

  before(cleanup);
  after(cleanup);

  beforeEach(async () => {
    await cleanup();
    // Last seen as an ordinary registered domain, and overdue for a check.
    await db.insert(domains).values({
      domain: DOMAIN,
      status: "active",
      bucket: "unavailable",
      nextCheckAt: new Date(NOW.getTime() - HOUR),
      lastCheckedAt: new Date(NOW.getTime() - HOUR),
    });
    await db.insert(watches).values({
      email: "poll-test@example.com",
      manageToken: `${PREFIX}token`,
      domain: DOMAIN,
      state: "watching",
    });
  });

  test("active -> pendingDelete logs a transition, alerts, and tightens to 6h", async () => {
    const drop = new Date(NOW.getTime() + 4 * 24 * HOUR).toISOString();
    const summary = await pollDue({
      db,
      now: NOW,
      provider: fake({ status: "deleting", bucket: "dropping", estimatedDropAt: drop }),
    });

    assert.equal(summary.transitions, 1);
    assert.equal(summary.alertsSent, 1, "pendingDelete is the alert that matters");

    const [row] = await db.select().from(domains).where(eq(domains.domain, DOMAIN));
    assert.equal(row.status, "deleting");
    assert.equal(
      row.nextCheckAt.getTime() - NOW.getTime(),
      6 * HOUR,
      "far from the drop, 6h is enough",
    );

    // The watch stays alive — pendingDelete is a warning, not the end.
    const [w] = await db.select().from(watches).where(eq(watches.domain, DOMAIN));
    assert.equal(w.state, "watching");
  });

  test("polling again with no status change sends nothing", async () => {
    const drop = new Date(NOW.getTime() + 4 * 24 * HOUR).toISOString();
    const provider = fake({ status: "deleting", bucket: "dropping", estimatedDropAt: drop });

    await pollDue({ db, now: NOW, provider });
    // Force it due again; the status is unchanged, so there's no new transition.
    await db
      .update(domains)
      .set({ nextCheckAt: new Date(NOW.getTime() - HOUR) })
      .where(eq(domains.domain, DOMAIN));
    const second = await pollDue({ db, now: NOW, provider });

    assert.equal(second.transitions, 0, "no transition means no alert");
    assert.equal(second.alertsSent, 0);

    const events = await db.select().from(watchEvents).where(eq(watchEvents.domain, DOMAIN));
    assert.equal(events.length, 1, "the transition log records changes, not observations");
  });

  test("inside 24h of the estimated drop, cadence tightens to hourly", async () => {
    const drop = new Date(NOW.getTime() + 6 * HOUR).toISOString();
    await pollDue({
      db,
      now: NOW,
      provider: fake({ status: "deleting", bucket: "dropping", estimatedDropAt: drop }),
    });

    const [row] = await db.select().from(domains).where(eq(domains.domain, DOMAIN));
    assert.equal(row.nextCheckAt.getTime() - NOW.getTime(), HOUR);
  });

  test("redemption alerts nobody but is still logged and polled daily", async () => {
    const summary = await pollDue({
      db,
      now: NOW,
      provider: fake({ status: "expiring", bucket: "dropping" }),
    });

    assert.equal(summary.transitions, 1, "the timeline records it");
    assert.equal(summary.alertsSent, 0, "but redemption is not actionable — stay quiet");

    const [row] = await db.select().from(domains).where(eq(domains.domain, DOMAIN));
    assert.equal(row.nextCheckAt.getTime() - NOW.getTime(), 24 * HOUR);
  });

  test("available alerts and fires the watch, taking the domain out of the queue", async () => {
    const summary = await pollDue({
      db,
      now: NOW,
      provider: fake({ status: "available", bucket: "registrable" }),
    });

    assert.equal(summary.alertsSent, 1);

    const [w] = await db.select().from(watches).where(eq(watches.domain, DOMAIN));
    assert.equal(w.state, "fired");

    // A fired watch means the domain is no longer due for anyone.
    const again = await pollDue({ db, now: new Date(NOW.getTime() + 30 * 24 * HOUR) });
    assert.ok(
      !again.domains.includes(DOMAIN),
      "nobody is watching it any more, so it must not be polled",
    );
  });

  test("one transition fans out to every watcher, once each", async () => {
    await db.insert(watches).values([
      { email: "second@example.com", manageToken: `${PREFIX}t2`, domain: DOMAIN },
      { email: "third@example.com", manageToken: `${PREFIX}t3`, domain: DOMAIN },
    ]);

    const summary = await pollDue({
      db,
      now: NOW,
      provider: fake({ status: "deleting", bucket: "dropping" }),
    });

    assert.equal(summary.transitions, 1, "one transition — it's a fact about the domain");
    assert.equal(summary.alertsSent, 3, "but three people hear about it");

    // ...and one RDAP call served all three. That's the normalisation paying off.
    const events = await db.select().from(watchEvents).where(eq(watchEvents.domain, DOMAIN));
    assert.equal(events.length, 1);
  });

  test("a re-derived (watch, event) pair cannot send twice", async () => {
    await pollDue({
      db,
      now: NOW,
      provider: fake({ status: "deleting", bucket: "dropping" }),
    });

    const [ev] = await db.select().from(watchEvents).where(eq(watchEvents.domain, DOMAIN));
    const [w] = await db.select().from(watches).where(eq(watches.domain, DOMAIN));

    // Simulate a cron retry re-claiming the same pair.
    const dup = await db
      .insert(alerts)
      .values({ watchId: w.id, eventId: ev.id })
      .onConflictDoNothing()
      .returning({ id: alerts.id });

    assert.equal(dup.length, 0, "the unique constraint is what makes retries safe");

    const sent = await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.watchId, w.id), eq(alerts.eventId, ev.id)));
    assert.equal(sent.length, 1);
  });

  test("an unknown result is not a transition — it backs off and keeps the last status", async () => {
    const summary = await pollDue({
      db,
      now: NOW,
      provider: fake({ status: "unknown", bucket: "unknown" }),
    });

    assert.equal(summary.transitions, 0);
    assert.equal(summary.failures, 1);

    const [row] = await db.select().from(domains).where(eq(domains.domain, DOMAIN));
    assert.equal(row.status, "active", "we couldn't tell, so we didn't change our mind");
    assert.equal(row.failureCount, 1);
    assert.equal(row.nextCheckAt.getTime() - NOW.getTime(), HOUR);
  });
});
