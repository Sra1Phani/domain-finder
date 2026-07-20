import { strict as assert } from "node:assert";
import { test } from "node:test";
import { availabilityToUi, toWatchRow, type WatchStatusResponse } from "./watch-status";
import type { LocalWatch } from "./watch-store";

const local: LocalWatch = { domain: "acme.com", token: "abcdefghijklmnop0123", addedAt: 1 };

test("availabilityToUi never maps a non-available status to available", () => {
  assert.equal(availabilityToUi("available"), "available");
  assert.equal(availabilityToUi("parked"), "parked");
  for (const s of ["active", "reserved", "expiring", "deleting"]) {
    assert.equal(availabilityToUi(s), "taken");
  }
  // unknown and anything unrecognized stay neutral — never green
  assert.equal(availabilityToUi("unknown"), "unknown");
  assert.equal(availabilityToUi("weird-new-status"), "unknown");
});

test("toWatchRow maps a real response to a row with formatted dates", () => {
  const remote: WatchStatusResponse = {
    domain: "acme.com",
    status: "active",
    state: "watching",
    expiresAt: "2027-03-01T00:00:00.000Z",
    lastCheckedAt: "2026-07-20T09:30:00.000Z",
    nextCheckAt: "2026-07-20T15:30:00.000Z",
  };
  const row = toWatchRow(local, remote);
  assert.equal(row.uiStatus, "taken");
  assert.equal(row.statusLabel, "Taken");
  assert.equal(row.expiry, "2027-03-01");
  assert.equal(row.lastChecked, "2026-07-20");
  assert.equal(row.error, false);
  assert.equal(row.loading, false);
  assert.equal(row.token, local.token);
});

test("toWatchRow loading/error placeholders render as neutral unknown, not available", () => {
  const loading = toWatchRow(local, null, { loading: true });
  assert.equal(loading.uiStatus, "unknown");
  assert.equal(loading.loading, true);
  assert.equal(loading.statusLabel, "Checking…");
  assert.equal(loading.expiry, "—");

  const errored = toWatchRow(local, null, { error: true });
  assert.equal(errored.uiStatus, "unknown");
  assert.equal(errored.error, true);
  assert.equal(errored.statusLabel, "Status unavailable");
});

test("toWatchRow formats null dates as an em-dash", () => {
  const remote: WatchStatusResponse = {
    domain: "acme.com",
    status: "available",
    state: "fired",
    expiresAt: null,
    lastCheckedAt: null,
    nextCheckAt: null,
  };
  const row = toWatchRow(local, remote);
  assert.equal(row.uiStatus, "available");
  assert.equal(row.expiry, "—");
  assert.equal(row.lastChecked, "—");
});
