import { strict as assert } from "node:assert";
import { test } from "node:test";
import { normalizeName, similarity } from "./strings";

test("normalizeName lowercases, strips diacritics and non-alphanumerics", () => {
  assert.equal(normalizeName("Açme, Inc."), "acmeinc");
  assert.equal(normalizeName("ACME"), "acme");
  assert.equal(normalizeName("acme inc"), "acmeinc");
  assert.equal(normalizeName("  Foo-Bar_123  "), "foobar123");
});

test("similarity is 1 for exact-after-normalization and near-1 for close", () => {
  assert.equal(similarity("Acme", "acme"), 1);
  assert.equal(similarity("Açme, Inc.", "acme inc"), 1);
  // one substitution in a 4-char word -> 1 - 1/4 = 0.75
  assert.equal(similarity("acme", "acms"), 0.75);
});

test("similarity falls toward 0 for very different names", () => {
  assert.ok(similarity("acme", "zzzzzzzz") < 0.2);
  assert.equal(similarity("acme", ""), 0);
});

test("two empty-after-normalization inputs are identical", () => {
  assert.equal(similarity("...", "  "), 1);
});

test("similarity is symmetric", () => {
  assert.equal(similarity("hello", "hallo"), similarity("hallo", "hello"));
});
