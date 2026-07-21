import { strict as assert } from "node:assert";
import { test } from "node:test";
import { filterAvailable } from "./available-filter";

const rows = [
  { id: "a", status: "available" },
  { id: "b", status: "taken" },
  { id: "c", status: "unknown" },
  { id: "d", status: "available" },
];

test("off: returns the list unchanged", () => {
  assert.deepEqual(filterAvailable(rows, false), rows);
});

test("on: keeps only available; unknown/taken never pass", () => {
  assert.deepEqual(
    filterAvailable(rows, true).map((r) => r.id),
    ["a", "d"],
  );
});

test("empty-state path: on + nothing available yields []", () => {
  const taken = [
    { id: "x", status: "taken" },
    { id: "y", status: "parked" },
    { id: "z", status: "unknown" },
  ];
  assert.deepEqual(filterAvailable(taken, true), []);
});
