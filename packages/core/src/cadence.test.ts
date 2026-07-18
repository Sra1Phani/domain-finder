// Cadence tests. The clock is injected, so the interesting cases — "6 hours
// before a drop", "29 days before expiry" — are cheap to state exactly.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  checkIntervalMs,
  DAY,
  HOUR,
  isAlertable,
  isTerminal,
  nextCheckAt,
  WEEK,
} from "./cadence";

const NOW = new Date("2026-07-17T12:00:00Z");
const iso = (msFromNow: number) => new Date(NOW.getTime() + msFromNow).toISOString();

test("a far-future active domain is checked weekly", () => {
  assert.equal(
    checkIntervalMs({ status: "active", expiresAt: iso(400 * DAY) }, NOW),
    WEEK,
  );
});

test("an active domain with no known expiry is checked weekly", () => {
  assert.equal(checkIntervalMs({ status: "active" }, NOW), WEEK);
});

test("active tightens to daily once expiry is inside 30 days", () => {
  assert.equal(
    checkIntervalMs({ status: "active", expiresAt: iso(29 * DAY) }, NOW),
    DAY,
  );
});

test("the 30-day expiry boundary is inclusive", () => {
  assert.equal(
    checkIntervalMs({ status: "active", expiresAt: iso(30 * DAY) }, NOW),
    DAY,
  );
  assert.equal(
    checkIntervalMs({ status: "active", expiresAt: iso(31 * DAY) }, NOW),
    WEEK,
  );
});

test("parked follows the same expiry-driven cadence as active", () => {
  assert.equal(
    checkIntervalMs({ status: "parked", expiresAt: iso(10 * DAY) }, NOW),
    DAY,
  );
  assert.equal(checkIntervalMs({ status: "parked" }, NOW), WEEK);
});

test("redemption (expiring) is checked daily", () => {
  assert.equal(checkIntervalMs({ status: "expiring" }, NOW), DAY);
});

test("pendingDelete is checked every 6h while the drop is far off", () => {
  assert.equal(
    checkIntervalMs({ status: "deleting", estimatedDropAt: iso(4 * DAY) }, NOW),
    6 * HOUR,
  );
});

test("pendingDelete tightens to hourly inside 24h of the estimated drop", () => {
  assert.equal(
    checkIntervalMs({ status: "deleting", estimatedDropAt: iso(20 * HOUR) }, NOW),
    HOUR,
  );
});

test("a drop estimate already in the past still polls hourly, not every 6h", () => {
  assert.equal(
    checkIntervalMs({ status: "deleting", estimatedDropAt: iso(-2 * HOUR) }, NOW),
    HOUR,
  );
});

test("pendingDelete with no drop estimate falls back to 6h", () => {
  assert.equal(checkIntervalMs({ status: "deleting" }, NOW), 6 * HOUR);
});

test("an unparseable date is treated as absent rather than throwing", () => {
  assert.equal(checkIntervalMs({ status: "active", expiresAt: "soon-ish" }, NOW), WEEK);
  assert.equal(
    checkIntervalMs({ status: "deleting", estimatedDropAt: "???" }, NOW),
    6 * HOUR,
  );
});

test("unknown backs off exponentially from 1h and caps at a day", () => {
  // failureCount counts the failure being scheduled for, so the first is 1.
  assert.equal(checkIntervalMs({ status: "unknown", failureCount: 1 }, NOW), HOUR);
  assert.equal(checkIntervalMs({ status: "unknown", failureCount: 2 }, NOW), 2 * HOUR);
  assert.equal(checkIntervalMs({ status: "unknown", failureCount: 3 }, NOW), 4 * HOUR);
  assert.equal(checkIntervalMs({ status: "unknown", failureCount: 99 }, NOW), DAY);
});

test("a missing or zero failureCount still yields the shortest retry, not a fractional one", () => {
  assert.equal(checkIntervalMs({ status: "unknown" }, NOW), HOUR);
  assert.equal(checkIntervalMs({ status: "unknown", failureCount: 0 }, NOW), HOUR);
});

test("nextCheckAt is now plus the interval", () => {
  assert.equal(
    nextCheckAt({ status: "expiring" }, NOW).toISOString(),
    "2026-07-18T12:00:00.000Z",
  );
});

test("only pendingDelete and available are alertable", () => {
  assert.equal(isAlertable("deleting"), true);
  assert.equal(isAlertable("available"), true);
  for (const s of ["active", "parked", "expiring", "reserved", "unknown"] as const) {
    assert.equal(isAlertable(s), false, `${s} must not alert`);
  }
});

test("available ends the watch; deleting does not", () => {
  assert.equal(isTerminal("available"), true);
  assert.equal(isTerminal("deleting"), false);
});
