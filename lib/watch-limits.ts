// The free-tier watch cap, in a client-safe module (no node/db imports) so both
// the server enforcement (lib/watch.ts) and the UI usage meter share ONE source
// of truth. The server remains authoritative — it counts per email and returns
// 429 — this constant just drives the cosmetic meter and the upgrade prompt.

/** Free tier. One domain is a demo; three is a habit. */
export const FREE_WATCH_LIMIT = 3;
