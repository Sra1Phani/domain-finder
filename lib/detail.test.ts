import { strict as assert } from "node:assert";
import { test } from "node:test";
import { toDetailRows } from "./detail";
import type { SurfaceState } from "./check-stream";

const dom = (surface: string, status: SurfaceState["status"], extra: Partial<SurfaceState> = {}): SurfaceState => ({
  surface,
  type: "domain",
  label: surface,
  status,
  ...extra,
});
const reg = (surface: string, status: SurfaceState["status"], extra: Partial<SurfaceState> = {}): SurfaceState => ({
  surface,
  type: "registry",
  label: surface,
  status,
  ...extra,
});

test("available domain → Register CTA; taken/parked → WHOIS; unknown → no CTA", () => {
  const rows = toDetailRows([
    dom("acme.com", "available"),
    dom("acme.io", "taken"),
    dom("acme.dev", "parked"),
    dom("acme.app", "unknown"),
  ]);
  assert.equal(rows[0].cta?.label, "Register acme.com");
  assert.match(rows[0].cta!.href, /namecheap\.com/);
  assert.equal(rows[1].cta?.label, "WHOIS");
  assert.match(rows[1].cta!.href, /whois\.com/);
  assert.equal(rows[2].cta?.label, "WHOIS");
  assert.equal(rows[3].cta, null, "unknown has nothing real to link to");
});

test("registry CTA only when the stream gave a real url", () => {
  const rows = toDetailRows([
    reg("github", "taken", { url: "https://github.com/acme" }),
    reg("npm", "available"), // no url → no CTA
  ]);
  assert.equal(rows[0].cta?.label, "Open profile");
  assert.equal(rows[0].cta?.href, "https://github.com/acme");
  assert.equal(rows[1].cta, null);
});

test("acquire slot: restricted renders, and absent acquire data stays null (never fabricated)", () => {
  const rows = toDetailRows([
    dom("acme.map", "available", { restricted: true }),
    dom("acme.com", "available", { restricted: false }),
    dom("acme.io", "available"), // restricted unknown (null)
  ]);
  assert.deepEqual(rows[0].acquire, { kind: "restricted" });
  assert.equal(rows[1].acquire, null, "not restricted → no treatment");
  assert.equal(rows[2].acquire, null, "unknown restriction → no treatment");
});

test("acquire slot: a real for-sale price renders; premium flag renders; nothing invented", () => {
  const forSale = toDetailRows([
    dom("acme.com", "parked", { acquire: { forSale: true, price: 2500, buyUrl: "https://buy.example/acme" } }),
  ]);
  assert.deepEqual(forSale[0].acquire, { kind: "forSale", price: 2500, href: "https://buy.example/acme" });

  const premium = toDetailRows([dom("acme.com", "available", { acquire: { premium: true } })]);
  assert.deepEqual(premium[0].acquire, { kind: "premium" });

  // acquire present but all-null → no treatment (no fake price)
  const empty = toDetailRows([dom("acme.com", "available", { acquire: { premium: null, forSale: null, price: null } })]);
  assert.equal(empty[0].acquire, null);
});

test("checking rows show a checking meta, not a fabricated status line", () => {
  const [row] = toDetailRows([dom("acme.com", "checking")]);
  assert.equal(row.meta, "checking…");
  assert.equal(row.cta, null);
});
