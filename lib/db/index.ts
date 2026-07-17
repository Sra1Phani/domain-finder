// Database client.
//
// Lazily constructed on purpose: the search pipeline (generate -> RDAP -> rank)
// still works with zero configuration, exactly as it did before the watchlist
// existed. Only the watchlist needs DATABASE_URL, so only the watchlist pays
// for its absence — `getDb()` throws when called, not when imported.

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

// Cached on globalThis so `next dev` hot-reloads don't open a new pool per edit.
const g = globalThis as typeof globalThis & {
  __domainFinderDb?: Db;
  __domainFinderSql?: ReturnType<typeof postgres>;
};

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb(): Db {
  if (g.__domainFinderDb) return g.__domainFinderDb;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — the watchlist needs a database. " +
        "Search works without one; see README.",
    );
  }

  const client = postgres(url, { max: 5 });
  const db = drizzle(client, { schema });
  g.__domainFinderSql = client;
  g.__domainFinderDb = db;
  return db;
}

export { schema };
