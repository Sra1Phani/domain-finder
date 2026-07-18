// Synthetic RDAP payload tests for the status taxonomy.
//
// These exist because the states that matter most to the watchlist —
// redemptionPeriod and pendingDelete — are rare in the wild and cannot be
// summoned on demand to test against live data. Everything else in this app is
// verified by driving real RDAP; this file covers the part that can't be.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { interpretRegistered, isParked, type RdapDomain } from "./rdap-status";

const EXPIRY = "2027-03-11T00:00:00Z";

function payload(over: Partial<RdapDomain> = {}): RdapDomain {
  return {
    status: ["client transfer prohibited"],
    events: [
      { eventAction: "registration", eventDate: "2015-01-01T00:00:00Z" },
      { eventAction: "expiration", eventDate: EXPIRY },
    ],
    nameservers: [{ ldhName: "NS1.EXAMPLE-HOST.COM" }],
    ...over,
  };
}

test("pendingDelete wins over transfer-prohibited (precedence is most-severe-first)", () => {
  const r = interpretRegistered(
    payload({ status: ["client transfer prohibited", "pending delete"] }),
  );
  assert.equal(r.status, "deleting");
});

test("redemptionPeriod reads as expiring", () => {
  const r = interpretRegistered(
    payload({ status: ["redemption period", "client hold"] }),
  );
  assert.equal(r.status, "expiring");
  assert.equal(r.estimatedDropAt, undefined, "only pendingDelete gets a drop estimate");
});

test("pendingDelete outranks redemptionPeriod when both are present", () => {
  const r = interpretRegistered(
    payload({ status: ["redemption period", "pending delete"] }),
  );
  assert.equal(r.status, "deleting");
});

test("estimatedDropAt is 'last changed' plus the fixed 5-day pendingDelete window", () => {
  const r = interpretRegistered(
    payload({
      status: ["pending delete"],
      events: [
        { eventAction: "expiration", eventDate: EXPIRY },
        { eventAction: "last changed", eventDate: "2026-07-10T00:00:00Z" },
      ],
    }),
  );
  assert.equal(r.estimatedDropAt, "2026-07-15T00:00:00.000Z");
});

test("pendingDelete without a 'last changed' event yields no drop estimate rather than a guess", () => {
  const r = interpretRegistered(
    payload({
      status: ["pending delete"],
      events: [{ eventAction: "expiration", eventDate: EXPIRY }],
    }),
  );
  assert.equal(r.status, "deleting");
  assert.equal(r.estimatedDropAt, undefined);
});

test("reserved is recognised", () => {
  const r = interpretRegistered(payload({ status: ["reserved"] }));
  assert.equal(r.status, "reserved");
});

test("parking nameservers read as parked", () => {
  const r = interpretRegistered(
    payload({
      status: ["client transfer prohibited"],
      nameservers: [{ ldhName: "NS1.SEDOPARKING.COM" }],
    }),
  );
  assert.equal(r.status, "parked");
});

test("Cloudflare is not parking — premium domains hide there, absence proves nothing", () => {
  const r = interpretRegistered(
    payload({
      nameservers: [{ ldhName: "ANDY.NS.CLOUDFLARE.COM" }],
    }),
  );
  assert.equal(r.status, "active");
});

test("generic registrar DNS is not parking (it hosts plenty of real sites)", () => {
  assert.equal(isParked(["ns1.domaincontrol.com"]), false);
  assert.equal(isParked(["dns1.registrar-servers.com"]), false);
});

test("expiration event surfaces as expiresAt, and statuses are lowercased", () => {
  const r = interpretRegistered(payload({ status: ["Client Transfer Prohibited"] }));
  assert.equal(r.status, "active");
  assert.equal(r.expiresAt, EXPIRY);
  assert.deepEqual(r.rawStatuses, ["client transfer prohibited"]);
});
