import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseCheckInput } from "./check-input";

test("a bare name is unchanged with no extra TLD", () => {
  assert.deepEqual(parseCheckInput("toolna"), { name: "toolna", extraTlds: [] });
  assert.deepEqual(parseCheckInput("  MyName "), { name: "myname", extraTlds: [] });
});

test("a full domain (domain-hack) splits into stem + TLD — no double TLD", () => {
  // the reported bug: toolna.me was becoming toolna.me.com
  assert.deepEqual(parseCheckInput("toolna.me"), { name: "toolna", extraTlds: [".me"] });
  assert.deepEqual(parseCheckInput("MyApp.COM"), { name: "myapp", extraTlds: [".com"] });
});

test("a restricted suffix is split off but NOT added (never appended as .map.com)", () => {
  assert.deepEqual(parseCheckInput("career.map"), { name: "career", extraTlds: [] });
});

test("a non-TLD suffix is left as part of the name", () => {
  // ".x" is too short to be a TLD → treat the whole thing as the name
  assert.deepEqual(parseCheckInput("foo.x"), { name: "foo.x", extraTlds: [] });
});
