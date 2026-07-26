// Best-effort request logging: persist every input/output to the database for
// analytics and abuse review.
//
// Two properties keep this from touching the request's behaviour:
//   1. It NEVER throws into the caller — a DB outage or a missing table just
//      drops the log (with a server-side warning). Callers schedule it via
//      Next's `after()` so it runs after the response is already sent.
//   2. It NO-OPs when no database is configured, so plain search stays runnable
//      with zero config (the DB is otherwise watchlist-only).
//
// Deliberately Next-free so it unit-tests without a request context; the surfaces
// (app/api/search + lib/mcp/register) own the `after()` scheduling.

import { createHash } from "node:crypto";
import { getDb, hasDatabase } from "./db";
import { requestLogs } from "./db/schema";

export type RequestLogEntry = {
  surface: "search" | "mcp";
  /** "search" | "check_name" | "generate_names" */
  operation: string;
  input: unknown;
  output: unknown;
  clientHash?: string | null;
};

/**
 * A salted, truncated hash of a client IP — enough to group requests by caller
 * without storing the raw address. Returns null for a missing or unknown IP.
 *
 * The salt comes from LOG_SALT (fall back to CRON_SECRET, then a constant). A
 * per-deploy secret salt means the hashes aren't reversible via a rainbow table
 * of the IPv4 space; the constant fallback keeps local dev working.
 */
export function hashClient(ip: string | null | undefined): string | null {
  if (!ip || ip === "unknown") return null;
  const salt = process.env.LOG_SALT ?? process.env.CRON_SECRET ?? "domain-finder";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/**
 * Persist one request/response. Best-effort: never throws, never blocks the
 * caller's result, no-ops without a database.
 */
export async function logRequest(entry: RequestLogEntry): Promise<void> {
  if (!hasDatabase()) return;
  try {
    await getDb()
      .insert(requestLogs)
      .values({
        surface: entry.surface,
        operation: entry.operation,
        input: entry.input ?? null,
        output: entry.output ?? null,
        clientHash: entry.clientHash ?? null,
      });
  } catch (err) {
    console.warn("request-log: write failed", err);
  }
}
