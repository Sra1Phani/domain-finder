// Tests for the shared bounded worker pool extracted from checkMany.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mapPool, streamSettled } from "./pool";

const yieldTick = () => new Promise((r) => setImmediate(r));

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("caps concurrency at the requested bound and never exceeds it", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const items = Array.from({ length: 12 }, (_, i) => i);

  const out = await mapPool(items, 3, async (item) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await yieldTick(); // hold the slot so peers pile up if the cap allowed it
    inFlight--;
    return item * 10;
  });

  assert.equal(maxInFlight, 3, "exactly the cap should run at once");
  assert.ok(maxInFlight <= 3);
  // Order-preserving: out[i] corresponds to items[i].
  assert.deepEqual(out, items.map((i) => i * 10));
});

test("with fewer items than the cap, only that many workers run", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  await mapPool([1, 2], 6, async (item) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await yieldTick();
    inFlight--;
    return item;
  });
  assert.equal(maxInFlight, 2);
});

test("an empty input resolves to an empty array without spawning workers", async () => {
  const out = await mapPool([], 6, async () => {
    throw new Error("should not be called");
  });
  assert.deepEqual(out, []);
});

test("streamSettled yields in completion order, not input order", async () => {
  const a = deferred<string>();
  const b = deferred<string>();
  const gen = streamSettled<string>([() => a.promise, () => b.promise], 10);

  // The SECOND thunk settles first — it must be yielded first.
  b.resolve("B");
  assert.equal((await gen.next()).value, "B");
  a.resolve("A");
  assert.equal((await gen.next()).value, "A");
  assert.equal((await gen.next()).done, true);
});

test("streamSettled respects the concurrency bound and drains all", async () => {
  let inFlight = 0;
  let max = 0;
  const thunks = Array.from({ length: 8 }, (_, i) => async () => {
    inFlight++;
    max = Math.max(max, inFlight);
    await yieldTick();
    inFlight--;
    return i;
  });

  const out: number[] = [];
  for await (const v of streamSettled(thunks, 3)) out.push(v);

  assert.equal(max, 3, "never more than the cap in flight");
  assert.deepEqual([...out].sort((x, y) => x - y), [0, 1, 2, 3, 4, 5, 6, 7]);
});
