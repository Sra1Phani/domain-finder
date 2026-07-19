import { strict as assert } from "node:assert";
import { test } from "node:test";
import { STATUS_STYLES, statusStyle, isDashed, type UiStatus } from "./status";

const ALL: UiStatus[] = ["available", "taken", "parked", "unknown", "invalid", "soon", "checking"];
// The five statuses that carry a real verdict — each must be visually its own
// thing. ("soon" and "checking" deliberately share one neutral placeholder grey.)
const REAL: UiStatus[] = ["available", "taken", "parked", "unknown", "invalid"];

test("every real-verdict status maps to its OWN distinct style (unique solid fills)", () => {
  const solids = REAL.map((s) => STATUS_STYLES[s].solid);
  assert.equal(new Set(solids).size, solids.length, "no two real statuses share a solid color");
  // and every status resolves to a non-fallback, correctly-named style
  for (const s of ALL) {
    assert.equal(statusStyle(s).name, STATUS_STYLES[s].name);
  }
});

test("unknown and invalid NEVER share the available (green) style — the false-available guard", () => {
  const avail = STATUS_STYLES.available;
  for (const s of ["unknown", "invalid"] as const) {
    const st = STATUS_STYLES[s];
    assert.notEqual(st.solid, avail.solid, `${s}.solid must not equal available`);
    assert.notEqual(st.bg, avail.bg, `${s}.bg must not equal available`);
    assert.notEqual(st.text, avail.text, `${s}.text must not equal available`);
  }
});

test("the hue separation is preserved: available=green(150), unknown=neutral(265), invalid=purple(305)", () => {
  assert.match(STATUS_STYLES.available.solid, /\b150\b/, "available is green (hue 150)");
  assert.match(STATUS_STYLES.unknown.solid, /\b265\b/, "unknown is neutral grey (hue 265), not green");
  assert.match(STATUS_STYLES.invalid.solid, /\b305\b/, "invalid is purple (hue 305)");
  assert.match(STATUS_STYLES.taken.solid, /\b25\b/, "taken is red (hue 25)");
  // unknown must be near-zero chroma (grey), not a pale green
  assert.match(STATUS_STYLES.unknown.solid, /0\.62 0\.02 265/);
});

test("statusStyle falls back to the neutral checking style for unrecognized input", () => {
  assert.equal(statusStyle("bogus").name, STATUS_STYLES.checking.name);
  assert.notEqual(statusStyle("bogus").solid, STATUS_STYLES.available.solid);
});

test("unknown and invalid render dashed; a definitive answer does not", () => {
  assert.equal(isDashed("unknown"), true);
  assert.equal(isDashed("invalid"), true);
  assert.equal(isDashed("available"), false);
  assert.equal(isDashed("taken"), false);
});
