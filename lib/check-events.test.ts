import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  streamCheck,
  toCheckEvent,
  type CheckEvent,
  type CheckStatus,
  type CheckSurfaceEvent,
} from "./check-events";
import type {
  AvailabilityResult,
  AvailabilityStatus,
  BrandStreamEvent,
  Core,
  NamespaceResult,
  NamespaceStatus,
} from "@domain-finder/core";

const avail = (
  domain: string,
  status: AvailabilityStatus,
  expiresAt?: string,
): AvailabilityResult => ({
  domain,
  status,
  bucket: "unavailable",
  via: "fake",
  checkedAt: "t",
  ...(expiresAt ? { expiresAt } : {}),
});

const ns = (
  surface: NamespaceResult["surface"],
  status: NamespaceStatus,
  url?: string,
): NamespaceResult => ({
  surface,
  name: "acme",
  normalized: "acme",
  status,
  checkedAt: "t",
  ...(url ? { url } : {}),
});

const domResult = (surface: string, r: AvailabilityResult): BrandStreamEvent =>
  ({ kind: "result", type: "domain", surface, result: r }) as BrandStreamEvent;
const nsResult = (surface: string, r: NamespaceResult): BrandStreamEvent =>
  ({ kind: "result", type: "namespace", surface, result: r }) as BrandStreamEvent;

// --- mapper: domain statuses -------------------------------------------------

test("domain statuses map to the UI status set; unknown stays unknown", () => {
  const cases: Array<[AvailabilityStatus, CheckStatus]> = [
    ["available", "available"],
    ["parked", "parked"],
    ["active", "taken"],
    ["reserved", "taken"],
    ["expiring", "taken"],
    ["deleting", "taken"],
    ["unknown", "unknown"],
  ];
  for (const [core, ui] of cases) {
    const ev = toCheckEvent(domResult("acme.com", avail("acme.com", core))) as CheckSurfaceEvent;
    assert.equal(ev.kind, "result");
    assert.equal(ev.type, "domain");
    assert.equal(ev.status, ui, `${core} -> ${ui}`);
    assert.equal(ev.tld, ".com");
    assert.equal(ev.label, "acme.com");
    // acquire is still a forward slot (null); restricted is now wired and
    // resolves to false for an ordinary registrable TLD like .com.
    assert.equal(ev.acquire, null);
    assert.equal(ev.restricted, false);
  }
});

test("restricted is true for a brand-operated TLD, false for a normal one", () => {
  const restricted = toCheckEvent(domResult("acme.map", avail("acme.map", "available"))) as CheckSurfaceEvent;
  assert.equal(restricted.restricted, true);
  const normal = toCheckEvent(domResult("acme.io", avail("acme.io", "available"))) as CheckSurfaceEvent;
  assert.equal(normal.restricted, false);
});

test("domain expiry is surfaced when known, else null", () => {
  const withExp = toCheckEvent(
    domResult("acme.com", avail("acme.com", "active", "2030-01-01T00:00:00Z")),
  ) as CheckSurfaceEvent;
  assert.equal(withExp.expiry, "2030-01-01T00:00:00Z");
  const without = toCheckEvent(domResult("acme.com", avail("acme.com", "available"))) as CheckSurfaceEvent;
  assert.equal(without.expiry, null);
});

// --- mapper: namespace statuses ----------------------------------------------

test("namespace statuses map 1:1 (incl. invalid + unknown), with registry labels", () => {
  const cases: Array<[NamespaceStatus, CheckStatus]> = [
    ["available", "available"],
    ["taken", "taken"],
    ["invalid", "invalid"],
    ["unknown", "unknown"],
  ];
  for (const [core, ui] of cases) {
    const ev = toCheckEvent(nsResult("github", ns("github", core))) as CheckSurfaceEvent;
    assert.equal(ev.type, "registry");
    assert.equal(ev.status, ui, `${core} -> ${ui}`);
    assert.equal(ev.label, "GitHub");
    assert.equal(ev.acquire, null);
    assert.equal(ev.restricted, null);
  }
  assert.equal(
    (toCheckEvent(nsResult("npm", ns("npm", "available"))) as CheckSurfaceEvent).label,
    "npm",
  );
  assert.equal(
    (toCheckEvent(nsResult("pypi", ns("pypi", "available"))) as CheckSurfaceEvent).label,
    "PyPI",
  );
});

test("namespace url passes through for taken, absent -> null", () => {
  const taken = toCheckEvent(
    nsResult("npm", ns("npm", "taken", "https://www.npmjs.com/package/acme")),
  ) as CheckSurfaceEvent;
  assert.equal(taken.url, "https://www.npmjs.com/package/acme");
  const invalid = toCheckEvent(nsResult("npm", ns("npm", "invalid"))) as CheckSurfaceEvent;
  assert.equal(invalid.url, null);
});

test("init and summary pass through unchanged", () => {
  assert.deepEqual(toCheckEvent({ kind: "init", surfaces: ["acme.com", "npm"] }), {
    kind: "init",
    surfaces: ["acme.com", "npm"],
  });
  assert.deepEqual(
    toCheckEvent({ kind: "summary", allClear: false, takenOn: ["npm"] }),
    { kind: "summary", allClear: false, takenOn: ["npm"] },
  );
});

// --- producer: streamCheck ---------------------------------------------------

function fakeCore(events: BrandStreamEvent[]): Pick<Core, "streamBrand"> {
  return {
    async *streamBrand() {
      for (const e of events) yield e;
    },
  };
}

async function collect(gen: AsyncGenerator<CheckEvent>): Promise<CheckEvent[]> {
  const out: CheckEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

test("streamCheck emits init -> N results -> summary, and keeps unknown unknown", async () => {
  const core = fakeCore([
    { kind: "init", surfaces: ["acme.com", "npm"] },
    domResult("acme.com", avail("acme.com", "available")),
    nsResult("npm", ns("npm", "unknown")),
    { kind: "summary", allClear: false, takenOn: [] },
  ]);

  const events = await collect(streamCheck(core, { name: "acme" }));

  assert.equal(events[0].kind, "init");
  assert.equal(events[1].kind, "result");
  assert.equal(events[2].kind, "result");
  assert.equal((events[2] as CheckSurfaceEvent).status, "unknown", "unknown survives the mapping");
  assert.equal(events[3].kind, "summary");
});

test("streamCheck yields a structured error and never calls the core on bad input", async () => {
  let called = false;
  const core: Pick<Core, "streamBrand"> = {
    async *streamBrand() {
      called = true;
    },
  };
  const events = await collect(streamCheck(core, { name: "  " }));
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "error");
  assert.equal(called, false, "no core call when the name is missing");
});
