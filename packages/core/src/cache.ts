// Cache abstraction for the core.
//
// The core never reaches for a concrete cache (Redis, Vercel KV, a module-level
// Map). It is handed a CacheStore. That keeps the boundary clean AND makes cache
// state fully resettable in tests: construct a fresh store, get a fresh world.
//
// Two implementations ship here: an in-memory store with real TTL expiry (the
// default), and a no-op store that disables caching entirely.

export interface CacheStore {
  /** Returns the cached value, or undefined if absent/expired. */
  get(key: string): Promise<unknown>;
  /** Store a value under key for ttlSeconds. ttlSeconds <= 0 means "don't store". */
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

type Entry = { value: unknown; expiresAt: number };

/**
 * In-memory TTL cache. The clock is injected (milliseconds) so tests can
 * advance time deterministically — the same reason lib cadence takes a clock.
 * Defaults to the wall clock.
 */
export function createMemoryCache(nowMs: () => number = () => Date.now()): CacheStore {
  const store = new Map<string, Entry>();
  return {
    async get(key) {
      const e = store.get(key);
      if (!e) return undefined;
      if (nowMs() >= e.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return e.value;
    },
    async set(key, value, ttlSeconds) {
      if (ttlSeconds <= 0) return;
      store.set(key, { value, expiresAt: nowMs() + ttlSeconds * 1000 });
    },
  };
}

/** Disables caching: every get misses, every set is dropped. */
export const noopCache: CacheStore = {
  async get() {
    return undefined;
  },
  async set() {
    /* intentionally nothing */
  },
};
