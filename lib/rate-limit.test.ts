import { strict as assert } from "node:assert";
import { test } from "node:test";
import { RateLimiter, clientKey } from "./rate-limit";

const T0 = 1_000_000;

test("allows up to the limit, then blocks within the window", () => {
  const rl = new RateLimiter(3, 60_000);
  assert.equal(rl.take("a", T0).ok, true);
  assert.equal(rl.take("a", T0 + 1).ok, true);
  const third = rl.take("a", T0 + 2);
  assert.equal(third.ok, true);
  assert.equal(third.remaining, 0);
  assert.equal(rl.take("a", T0 + 3).ok, false, "4th in-window request is blocked");
});

test("keys are independent buckets", () => {
  const rl = new RateLimiter(1, 60_000);
  assert.equal(rl.take("a", T0).ok, true);
  assert.equal(rl.take("b", T0).ok, true, "b has its own budget");
  assert.equal(rl.take("a", T0).ok, false);
});

test("the window resets once resetAt passes", () => {
  const rl = new RateLimiter(2, 60_000);
  rl.take("a", T0);
  rl.take("a", T0);
  assert.equal(rl.take("a", T0 + 59_999).ok, false, "still inside the window");
  assert.equal(rl.take("a", T0 + 60_000).ok, true, "boundary is a fresh window");
});

test("retryAfter counts up whole seconds to the reset", () => {
  const rl = new RateLimiter(1, 60_000);
  rl.take("a", T0);
  const blocked = rl.take("a", T0 + 10_000);
  assert.equal(blocked.retryAfter, 50);
});

test("sweep drops only expired windows", () => {
  const rl = new RateLimiter(1, 60_000);
  rl.take("old", T0);
  rl.take("new", T0 + 30_000);
  rl.sweep(T0 + 60_001);
  // 'old' was swept, so it gets a fresh allow; 'new' is still counted, so blocked.
  assert.equal(rl.take("old", T0 + 60_002).ok, true);
  assert.equal(rl.take("new", T0 + 60_002).ok, false);
});

test("clientKey takes the leftmost x-forwarded-for entry", () => {
  const req = new Request("http://x", {
    headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" },
  });
  assert.equal(clientKey(req), "203.0.113.7");
});

test("clientKey falls back to x-real-ip, then to a shared bucket", () => {
  assert.equal(
    clientKey(new Request("http://x", { headers: { "x-real-ip": "198.51.100.9" } })),
    "198.51.100.9",
  );
  assert.equal(clientKey(new Request("http://x")), "unknown");
});
