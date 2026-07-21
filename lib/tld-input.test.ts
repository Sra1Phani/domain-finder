import { strict as assert } from "node:assert";
import { test } from "node:test";
import { normalizeRegistrableTld, normalizeTld, registrableTlds } from "./tld-input";

test("normalizeTld adds the leading dot and lowercases", () => {
  assert.equal(normalizeTld("io"), ".io");
  assert.equal(normalizeTld(".IO"), ".io");
  assert.equal(normalizeTld("  Fm "), ".fm");
});

test("normalizeTld takes the last segment of a pasted domain", () => {
  assert.equal(normalizeTld("example.com"), ".com");
  assert.equal(normalizeTld("co.uk"), ".uk");
});

test("normalizeTld accepts punycode labels", () => {
  assert.equal(normalizeTld("xn--p1ai"), ".xn--p1ai");
});

test("normalizeTld rejects junk (too short, numeric, empty)", () => {
  assert.equal(normalizeTld("a"), null);
  assert.equal(normalizeTld("123"), null);
  assert.equal(normalizeTld(""), null);
  assert.equal(normalizeTld("."), null);
  assert.equal(normalizeTld("!!"), null);
});

test("registrableTlds drops brand-operated/restricted TLDs from the picker", () => {
  assert.deepEqual(registrableTlds([".com", ".map", ".io", ".gov", ".dev"]), [".com", ".io", ".dev"]);
});

test("normalizeRegistrableTld rejects a restricted TLD but accepts a normal one", () => {
  assert.equal(normalizeRegistrableTld("map"), null); // brand-operated
  assert.equal(normalizeRegistrableTld(".gov"), null);
  assert.equal(normalizeRegistrableTld("io"), ".io");
});
