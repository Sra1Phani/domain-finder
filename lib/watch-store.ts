// Device-local watchlist store — pure logic, no localStorage or React.
//
// The watch backend is ANONYMOUS: identity is an email plus an unguessable
// manage token, with no accounts and no "list my watches" endpoint (building
// one would leak every address's watchlist). So the browser remembers only the
// watches created ON THIS DEVICE — the domain plus its manage token — and each
// row's LIVE status is read back from the server BY TOKEN (the token is the
// credential). This module is the add/dedupe/remove/cap logic; the component
// owns persistence and the network.

export type LocalWatch = {
  domain: string;
  /** the unguessable manage token — this is what authenticates status reads */
  token: string;
  /** epoch ms the watch was stored locally (0 if unknown) */
  addedAt: number;
};

const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
// base64url manage tokens (randomBytes(24).toString("base64url") ⇒ 32 chars).
const TOKEN_RE = /^[A-Za-z0-9_-]{16,}$/;

/**
 * Parse a persisted blob into a clean list, dropping anything malformed and
 * de-duplicating by domain. Never throws — corrupt storage degrades to an
 * empty (or partial) list rather than crashing the view.
 */
export function parseWatches(raw: string | null): LocalWatch[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: LocalWatch[] = [];
  const seen = new Set<string>();
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const { domain, token, addedAt } = item as Record<string, unknown>;
    if (typeof domain !== "string" || typeof token !== "string") continue;
    if (!DOMAIN_RE.test(domain) || !TOKEN_RE.test(token)) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);
    out.push({ domain, token, addedAt: typeof addedAt === "number" ? addedAt : 0 });
  }
  return out;
}

export function serializeWatches(list: LocalWatch[]): string {
  return JSON.stringify(list);
}

/** Add a watch, deduped by domain (the new entry wins), newest first. */
export function addWatch(list: LocalWatch[], entry: LocalWatch): LocalWatch[] {
  return [entry, ...list.filter((w) => w.domain !== entry.domain)];
}

/** Remove by token (the stable per-watch id). */
export function removeWatch(list: LocalWatch[], token: string): LocalWatch[] {
  return list.filter((w) => w.token !== token);
}

export function hasWatch(list: LocalWatch[], domain: string): boolean {
  return list.some((w) => w.domain === domain);
}

/**
 * Device-local view of the free cap. The SERVER is authoritative (it counts a
 * cap per email, across devices), so this only reflects what THIS device knows
 * — it drives the usage meter and is not a substitute for the server's 429.
 */
export function atCap(list: LocalWatch[], cap: number): boolean {
  return list.length >= cap;
}
