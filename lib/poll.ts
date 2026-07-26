// The poller: drain the due-queue, log transitions, alert on the ones that matter.
//
// Shape of a run:
//   1. select domains whose next_check_at has passed AND that someone is still
//      actively watching (a domain nobody watches is simply never due — no
//      bookkeeping needed to retire it)
//   2. re-check each via the existing availabilityProvider — this file adds no
//      RDAP logic, it only decides *when* to call and *what it means*
//   3. on a real status change, append to watch_events
//   4. for alertable transitions, fan the event out to every watcher
//   5. reschedule via the cadence table
//
// Idempotency: alerts are inserted before they're sent, guarded by
// unique(watch_id, event_id). A cron retry re-deriving the same pair hits the
// conflict and sends nothing. If the send itself fails we delete the row again
// so the next run retries it — at-least-once, with the duplicate window narrowed
// to a hard crash between insert and send.
//
// Retries are driven off *persisted state*, not off a fresh status change: a
// transition is logged once, but the alert for it is re-derived on every poll
// while the domain still sits in that alertable status (see latestAlertableEvent
// + the alert block in pollDue). That's what lets an alert that couldn't be
// delivered — a transient mailer failure, or no mail key configured yet — go out
// on a later run rather than being lost after the one poll that saw the change.

import { and, asc, desc, eq, exists, lte, sql } from "drizzle-orm";
import { getDb, type Db } from "./db";
import { alerts, domains, watchEvents, watches } from "./db/schema";
import { availabilityProvider } from "./core";
import {
  checkMany,
  isAlertable,
  isTerminal,
  nextCheckAt,
  type AvailabilityProvider,
  type AvailabilityResult,
} from "@domain-finder/core";
import { buildAlert } from "./alert-copy";
import { getMailer } from "./mailer";

/**
 * Per-run volume cap. RDAP is other people's infrastructure and registries don't
 * sell capacity, so a run is deliberately bounded: anything still due is simply
 * picked up by the next run. Ordering by next_check_at means the most overdue
 * (and therefore most time-critical) domains drain first.
 */
const DEFAULT_BATCH = 50;

export type PollSummary = {
  checked: number;
  transitions: number;
  alertsSent: number;
  failures: number;
  domains: string[];
};

/** Domains that are due and still have at least one active watcher. */
async function selectDue(db: Db, limit: number, now: Date) {
  return db
    .select()
    .from(domains)
    .where(
      and(
        lte(domains.nextCheckAt, now),
        exists(
          db
            .select({ one: sql`1` })
            .from(watches)
            .where(
              and(eq(watches.domain, domains.domain), eq(watches.state, "watching")),
            ),
        ),
      ),
    )
    .orderBy(asc(domains.nextCheckAt))
    .limit(limit);
}

/**
 * Fan one transition out to everyone watching the domain.
 * Returns how many emails actually went out.
 */
async function fanOut(
  db: Db,
  domain: string,
  eventId: string,
  result: AvailabilityResult,
): Promise<number> {
  const watching = await db
    .select()
    .from(watches)
    .where(and(eq(watches.domain, domain), eq(watches.state, "watching")));

  const mailer = getMailer();
  // No delivery channel — production without a mail key (see getMailer). Don't
  // claim, don't fire the watch, don't log PII: leave every alert for this event
  // undelivered so a later run with a real mailer re-derives and sends it.
  if (!mailer) return 0;

  let sent = 0;

  for (const w of watching) {
    // Claim the (watch, event) pair first. If another run already claimed it,
    // onConflictDoNothing returns no row and we skip — that's the dedupe.
    const claimed = await db
      .insert(alerts)
      .values({ watchId: w.id, eventId, channel: mailer.name })
      .onConflictDoNothing()
      .returning({ id: alerts.id });

    if (claimed.length === 0) continue;

    const msg = buildAlert({
      domain,
      to: result.status,
      estimatedDropAt: result.estimatedDropAt,
      manageToken: w.manageToken,
    });

    const ok = await mailer.send({ to: w.email, ...msg });
    if (!ok) {
      // Release the claim so a later run retries this alert.
      await db.delete(alerts).where(eq(alerts.id, claimed[0].id));
      continue;
    }

    sent++;

    // `available` is the end of the story — stop watching so the domain falls
    // out of the due-queue once every watcher has been told.
    if (isTerminal(result.status)) {
      await db.update(watches).set({ state: "fired" }).where(eq(watches.id, w.id));
    }
  }

  return sent;
}

/**
 * Drain the due-queue once.
 *
 * `provider` is injectable for the same reason `checkMany` takes one: the two
 * states this whole feature exists to catch — redemptionPeriod and pendingDelete
 * — are rare enough that you cannot find one on demand to test against. A fake
 * provider is the only way to exercise the drop path end-to-end.
 */
export async function pollDue(
  opts: {
    limit?: number;
    now?: Date;
    db?: Db;
    provider?: AvailabilityProvider;
  } = {},
): Promise<PollSummary> {
  const db = opts.db ?? getDb();
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? DEFAULT_BATCH;
  const provider = opts.provider ?? availabilityProvider;

  const due = await selectDue(db, limit, now);
  const summary: PollSummary = {
    checked: 0,
    transitions: 0,
    alertsSent: 0,
    failures: 0,
    domains: due.map((d) => d.domain),
  };
  if (due.length === 0) return summary;

  // Reuse the existing bounded worker pool. Because due domains are mixed-TLD
  // they resolve to different registries, so per-registry pressure stays low.
  const results = await checkMany(
    due.map((d) => d.domain),
    6,
    provider,
  );

  for (let i = 0; i < due.length; i++) {
    const row = due[i];
    const res = results[i];
    summary.checked++;

    // An `unknown` is "we couldn't tell", not "the domain changed". Recording it
    // as a transition would fabricate an active->unknown->active round trip out
    // of a 429 and pollute the timeline. Keep the last known status, back off,
    // try again later.
    if (res.status === "unknown") {
      summary.failures++;
      const failureCount = row.failureCount + 1;
      await db
        .update(domains)
        .set({
          failureCount,
          lastCheckedAt: now,
          nextCheckAt: nextCheckAt({ status: "unknown", failureCount }, now),
        })
        .where(eq(domains.domain, row.domain));
      continue;
    }

    const changed = res.status !== row.status;
    let eventId: string | null = null;

    if (changed) {
      const [ev] = await db
        .insert(watchEvents)
        .values({
          domain: row.domain,
          fromStatus: row.status,
          toStatus: res.status,
          payload: res,
        })
        .returning({ id: watchEvents.id });
      eventId = ev.id;
      summary.transitions++;
    }

    await db
      .update(domains)
      .set({
        status: res.status,
        bucket: res.bucket,
        expiresAt: res.expiresAt ? new Date(res.expiresAt) : null,
        estimatedDropAt: res.estimatedDropAt ? new Date(res.estimatedDropAt) : null,
        lastCheckedAt: now,
        failureCount: 0,
        nextCheckAt: nextCheckAt(
          {
            status: res.status,
            expiresAt: res.expiresAt,
            estimatedDropAt: res.estimatedDropAt,
          },
          now,
        ),
      })
      .where(eq(domains.domain, row.domain));

    // Alerts fire on a transition into an actionable status. We attempt delivery
    // on every poll the domain sits in that status, not only the one that first
    // saw the change: on a fresh transition we use that event; otherwise we
    // re-derive the latest matching event so an alert deferred or failed on an
    // earlier run still goes out. fanOut's unique(watch_id, event_id) makes
    // redelivery a no-op for anyone already notified, so this never double-sends.
    if (isAlertable(res.status)) {
      const alertEventId =
        changed && eventId
          ? eventId
          : await latestAlertableEvent(db, row.domain, res.status);
      if (alertEventId) {
        summary.alertsSent += await fanOut(db, row.domain, alertEventId, res);
      }
    }
  }

  return summary;
}

/**
 * The most recent transition into `status` for a domain. Alerting re-derives the
 * event this way (rather than from a live status change) so a previously
 * undelivered alert can be retried while the domain remains in an alertable
 * state — the transition is only ever logged once.
 */
async function latestAlertableEvent(
  db: Db,
  domain: string,
  status: AvailabilityResult["status"],
): Promise<string | null> {
  const [ev] = await db
    .select({ id: watchEvents.id })
    .from(watchEvents)
    .where(and(eq(watchEvents.domain, domain), eq(watchEvents.toStatus, status)))
    .orderBy(desc(watchEvents.observedAt))
    .limit(1);
  return ev?.id ?? null;
}
