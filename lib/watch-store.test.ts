import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  addWatch,
  atCap,
  hasWatch,
  parseWatches,
  removeWatch,
  serializeWatches,
  type LocalWatch,
} from "./watch-store";

const TOKEN = "abcdefghijklmnop0123"; // 20 base64url chars
const TOKEN2 = "ZZZZYYYYXXXXWWWW9999";
const w = (domain: string, token = TOKEN, addedAt = 1): LocalWatch => ({ domain, token, addedAt });

test("addWatch dedupes by domain (new entry wins) and puts newest first", () => {
  let list: LocalWatch[] = [];
  list = addWatch(list, w("acme.com", TOKEN));
  list = addWatch(list, w("beta.io", TOKEN2));
  assert.deepEqual(list.map((x) => x.domain), ["beta.io", "acme.com"]);

  // re-adding acme.com with a new token replaces, doesn't duplicate
  list = addWatch(list, w("acme.com", "NEWtoken0123456789"));
  assert.equal(list.filter((x) => x.domain === "acme.com").length, 1);
  assert.equal(list[0].domain, "acme.com");
  assert.equal(list[0].token, "NEWtoken0123456789");
});

test("removeWatch removes by token; hasWatch checks domain presence", () => {
  const list = [w("acme.com", TOKEN), w("beta.io", TOKEN2)];
  assert.ok(hasWatch(list, "acme.com"));
  const after = removeWatch(list, TOKEN);
  assert.deepEqual(after.map((x) => x.domain), ["beta.io"]);
  assert.ok(!hasWatch(after, "acme.com"));
});

test("atCap reflects the device-local count against the cap", () => {
  assert.ok(!atCap([w("a.com"), w("b.com")], 3));
  assert.ok(atCap([w("a.com", TOKEN), w("b.com", TOKEN2), w("c.com", "cccccccccccccccc")], 3));
});

test("parseWatches round-trips and drops malformed / duplicate entries", () => {
  const good = [w("acme.com", TOKEN, 5), w("beta.io", TOKEN2, 6)];
  assert.deepEqual(parseWatches(serializeWatches(good)), good);

  // malformed: bad domain, short token, dup domain, non-object, missing fields
  const dirty = JSON.stringify([
    { domain: "acme.com", token: TOKEN, addedAt: 5 },
    { domain: "acme.com", token: TOKEN2, addedAt: 9 }, // dup domain -> dropped
    { domain: "not a domain", token: TOKEN }, // bad domain
    { domain: "x.com", token: "short" }, // bad token
    { domain: "y.com" }, // missing token
    42,
    null,
  ]);
  assert.deepEqual(parseWatches(dirty), [{ domain: "acme.com", token: TOKEN, addedAt: 5 }]);
});

test("parseWatches never throws on garbage/empty input", () => {
  assert.deepEqual(parseWatches(null), []);
  assert.deepEqual(parseWatches(""), []);
  assert.deepEqual(parseWatches("{not json"), []);
  assert.deepEqual(parseWatches('{"not":"an array"}'), []);
});
