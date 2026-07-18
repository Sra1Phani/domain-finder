// How often to re-check a watched domain.
//
// The whole point of the due-queue is that RDAP load stays proportional to how
// *interesting* a domain is, not to how many domains exist. A domain registered
// until 2031 gets looked at weekly; one in pendingDelete with a drop estimate
// tomorrow gets looked at hourly. Everything in between grades smoothly.
//
// Pure by design: no clock, no I/O, `now` is always injected. That's what makes
// the rare states (redemption, pendingDelete) testable — they're nearly
// impossible to find in the wild on demand.

import type { AvailabilityStatus } from "./types";

export const HOUR = 3_600_000;
export const DAY = 86_400_000;
export const WEEK = 7 * DAY;

/** Inside this window of the estimated drop, poll hourly. */
export const NEAR_DROP_MS = 24 * HOUR;
/** An otherwise-quiet domain this close to expiry becomes worth daily attention. */
export const EXPIRY_SOON_MS = 30 * DAY;

/** Ceiling on the exponential backoff applied to transient `unknown` results. */
const MAX_BACKOFF_MS = DAY;

export type CadenceInput = {
  status: AvailabilityStatus;
  expiresAt?: string | Date | null;
  estimatedDropAt?: string | Date | null;
  /**
   * Consecutive `unknown` observations *including the one being scheduled for*.
   * So the first failure is 1, and gets the shortest retry.
   */
  failureCount?: number;
};

function toMs(v: string | Date | null | undefined): number | null {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/**
 * Milliseconds until this domain should next be checked.
 *
 * Cadence by status:
 * - `deleting`   6h, tightening to 1h inside 24h of the estimated drop
 * - `expiring`   daily (redemption can end in a restore or a drop)
 * - `active`/`parked`  daily if expiry is <30d away, else weekly
 * - `reserved`   weekly (it will never become registrable, but it's cheap)
 * - `unknown`    exponential backoff from 1h, capped at a day — an `unknown`
 *                here is a transient failure (429/timeout/registry down),
 *                because TLDs with no RDAP server are rejected at watch
 *                creation rather than polled forever.
 * - `available`  weekly; in practice terminal, since the due-queue only selects
 *                domains that still have a `watching` watch and the `available`
 *                alert fires the watch.
 */
export function checkIntervalMs(input: CadenceInput, now: Date): number {
  const t = now.getTime();

  switch (input.status) {
    case "deleting": {
      const drop = toMs(input.estimatedDropAt);
      if (drop !== null && drop - t <= NEAR_DROP_MS) return HOUR;
      return 6 * HOUR;
    }

    case "expiring":
      return DAY;

    case "active":
    case "parked": {
      const exp = toMs(input.expiresAt);
      if (exp !== null && exp - t <= EXPIRY_SOON_MS) return DAY;
      return WEEK;
    }

    case "unknown": {
      // 1st failure 1h, 2nd 2h, 3rd 4h ... capped at a day.
      const failures = Math.max(1, input.failureCount ?? 1);
      return Math.min(HOUR * 2 ** (failures - 1), MAX_BACKOFF_MS);
    }

    case "reserved":
    case "available":
      return WEEK;
  }
}

export function nextCheckAt(input: CadenceInput, now: Date): Date {
  return new Date(now.getTime() + checkIntervalMs(input, now));
}

/**
 * Statuses that are worth an email. Deliberately narrow.
 *
 * `deleting` is the product: pendingDelete is a fixed ~5-day window, so it's the
 * last moment a backorder can be placed — that warning is the thing being sold.
 * `available` closes the loop honestly (usually to report that a drop-catcher
 * got there first). Everything else is logged and visible in the UI but silent,
 * because alerting on active->parked trains people to ignore the mail.
 */
const ALERTABLE: ReadonlySet<AvailabilityStatus> = new Set([
  "deleting",
  "available",
]);

export function isAlertable(to: AvailabilityStatus): boolean {
  return ALERTABLE.has(to);
}

/** `available` is the end of the story for a watch; `deleting` is not. */
export function isTerminal(to: AvailabilityStatus): boolean {
  return to === "available";
}
