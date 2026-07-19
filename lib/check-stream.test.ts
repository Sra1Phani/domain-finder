import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  applyCheckEvent,
  consumeNdjson,
  initialNameState,
  verdictOf,
  type CheckNameState,
} from "./check-stream";
import type { CheckEvent } from "./check-events";

// Drive a scripted NDJSON stream (optionally split into arbitrary chunks)
// through the pure parser + reducer, exactly as the component would.
function drive(name: string, chunks: string[]): CheckNameState {
  let state = initialNameState(name);
  let carry = "";
  for (const chunk of chunks) {
    const { events, carry: c } = consumeNdjson(chunk, carry);
    carry = c;
    for (const ev of events) state = applyCheckEvent(state, ev);
  }
  if (carry.trim()) {
    state = applyCheckEvent(state, JSON.parse(carry) as CheckEvent);
  }
  return state;
}

const line = (o: unknown) => JSON.stringify(o) + "\n";

const STREAM = [
  line({ kind: "init", surfaces: ["acme.com", "github", "npm"] }),
  line({ kind: "result", type: "registry", surface: "npm", label: "npm", status: "available", url: null, tld: null, expiry: null, restricted: null, acquire: null }),
  line({ kind: "result", type: "registry", surface: "github", label: "GitHub", status: "unknown", url: null, tld: null, expiry: null, restricted: null, acquire: null }),
  line({ kind: "result", type: "domain", surface: "acme.com", label: "acme.com", status: "available", url: null, tld: ".com", expiry: null, restricted: null, acquire: null }),
  line({ kind: "summary", allClear: false, takenOn: [] }),
].join("");

test("surfaces populate from init, then update as result events arrive", () => {
  const state = drive("acme", [STREAM]);
  assert.deepEqual(state.surfaces.map((s) => s.surface), ["acme.com", "github", "npm"]);
  const byId = new Map(state.surfaces.map((s) => [s.surface, s]));
  assert.equal(byId.get("npm")!.status, "available");
  assert.equal(byId.get("acme.com")!.status, "available");
  assert.equal(byId.get("acme.com")!.tld, ".com");
  assert.equal(state.done, true);
});

test("an 'unknown' event renders unknown — never available — and blocks all-clear", () => {
  const state = drive("acme", [STREAM]);
  const github = state.surfaces.find((s) => s.surface === "github")!;
  assert.equal(github.status, "unknown", "github must stay unknown");
  assert.notEqual(github.status, "available");
  const v = verdictOf(state);
  assert.equal(v.allClear, false, "an unknown surface must keep the name from all-clear");
});

test("all-clear only when every surface is confirmed available", () => {
  const clear = [
    line({ kind: "init", surfaces: ["acme.com", "npm"] }),
    line({ kind: "result", type: "domain", surface: "acme.com", label: "acme.com", status: "available" }),
    line({ kind: "result", type: "registry", surface: "npm", label: "npm", status: "available" }),
    line({ kind: "summary", allClear: true, takenOn: [] }),
  ].join("");
  const v = verdictOf(drive("acme", [clear]));
  assert.equal(v.allClear, true);
  assert.match(v.label, /All clear/);
});

test("parsing is correct across arbitrary chunk boundaries", () => {
  // Split the whole stream mid-line into 7 chunks.
  const size = Math.ceil(STREAM.length / 7);
  const chunks = [];
  for (let i = 0; i < STREAM.length; i += size) chunks.push(STREAM.slice(i, i + size));
  const state = drive("acme", chunks);
  assert.equal(state.surfaces.length, 3);
  assert.equal(state.surfaces.find((s) => s.surface === "github")!.status, "unknown");
  assert.equal(state.done, true);
});

test("a malformed line is skipped, not thrown", () => {
  const withGarbage =
    line({ kind: "init", surfaces: ["acme.com"] }) +
    "this is not json\n" +
    line({ kind: "result", type: "domain", surface: "acme.com", label: "acme.com", status: "available" });
  const state = drive("acme", [withGarbage]);
  assert.equal(state.surfaces[0].status, "available");
});

test("an error event yields the error state (never a fake result)", () => {
  const errStream =
    line({ kind: "init", surfaces: ["acme.com"] }) +
    line({ kind: "error", message: "A 'name' (non-empty string) is required." });
  const state = drive("acme", [errStream]);
  assert.equal(state.error, "A 'name' (non-empty string) is required.");
  const v = verdictOf(state);
  assert.equal(v.tone, "unknown");
  assert.match(v.label, /failed/i);
});

test("meta text uses real fields only (no fabricated counts)", () => {
  const s = drive("acme", [
    line({ kind: "init", surfaces: ["acme.com", "npm"] }) +
      line({ kind: "result", type: "domain", surface: "acme.com", label: "acme.com", status: "taken", expiry: "2027-04-18T04:00:00Z" }) +
      line({ kind: "result", type: "registry", surface: "npm", label: "npm", status: "taken" }),
  ]);
  const dom = s.surfaces.find((x) => x.surface === "acme.com")!;
  const npm = s.surfaces.find((x) => x.surface === "npm")!;
  assert.match(dom.meta!, /Registered · expires 2027-04-18/);
  assert.equal(npm.meta, "Taken"); // no "weekly downloads", no version — real fields only
});
