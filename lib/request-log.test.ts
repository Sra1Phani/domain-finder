import { strict as assert } from "node:assert";
import { after, before, describe, test } from "node:test";
import { eq, like } from "drizzle-orm";
import { getDb, hasDatabase } from "./db";
import { requestLogs } from "./db/schema";
import { hashClient, logRequest } from "./request-log";

describe("hashClient", () => {
  test("null for a missing or unknown IP", () => {
    assert.equal(hashClient(null), null);
    assert.equal(hashClient(undefined), null);
    assert.equal(hashClient(""), null);
    assert.equal(hashClient("unknown"), null);
  });

  test("deterministic, distinct per IP, and never the raw address", () => {
    const a = hashClient("203.0.113.7");
    const b = hashClient("203.0.113.7");
    const c = hashClient("203.0.113.8");
    assert.equal(a, b, "same IP -> same hash");
    assert.notEqual(a, c, "different IP -> different hash");
    assert.ok(a && !a.includes("203.0.113.7"), "the raw IP is not recoverable from the hash");
    assert.equal(a!.length, 32);
  });

  test("the salt changes the hash", () => {
    const env = process.env as Record<string, string | undefined>;
    const saved = env.LOG_SALT;
    try {
      env.LOG_SALT = "salt-one";
      const one = hashClient("203.0.113.7");
      env.LOG_SALT = "salt-two";
      const two = hashClient("203.0.113.7");
      assert.notEqual(one, two);
    } finally {
      if (saved === undefined) delete env.LOG_SALT;
      else env.LOG_SALT = saved;
    }
  });
});

const PREFIX = "reqlogtest-";

describe("logRequest", { skip: !hasDatabase() && "DATABASE_URL not set" }, () => {
  const db = hasDatabase() ? getDb() : null!;

  async function cleanup() {
    await db.delete(requestLogs).where(like(requestLogs.operation, `${PREFIX}%`));
  }
  before(cleanup);
  after(cleanup);

  test("persists surface, input, output, and client hash", async () => {
    const input = { query: "vegan meal kit", tlds: [".com"] };
    const output = { results: [{ domain: "veganmealkit.com", score: 91 }] };
    await logRequest({
      surface: "search",
      operation: `${PREFIX}search`,
      input,
      output,
      clientHash: hashClient("203.0.113.7"),
    });

    const rows = await db
      .select()
      .from(requestLogs)
      .where(eq(requestLogs.operation, `${PREFIX}search`));
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.surface, "search");
    assert.deepEqual(row.input, input);
    assert.deepEqual(row.output, output);
    assert.equal(row.clientHash?.length, 32);
    assert.ok(row.createdAt instanceof Date);
  });

  test("a null client hash is allowed (MCP with no reachable IP)", async () => {
    await logRequest({
      surface: "mcp",
      operation: `${PREFIX}check_name`,
      input: { names: ["acme"] },
      output: { results: [] },
      clientHash: null,
    });

    const [row] = await db
      .select()
      .from(requestLogs)
      .where(eq(requestLogs.operation, `${PREFIX}check_name`));
    assert.equal(row.surface, "mcp");
    assert.equal(row.clientHash, null);
  });
});
