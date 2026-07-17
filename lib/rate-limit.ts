// A tiny fixed-window rate limiter.
//
// Why in-memory and not Redis: the thing being protected is registry goodwill
// (each search fans out to ~45 RDAP calls), and the abuse case is one client
// looping the endpoint. A per-instance counter stops that. It does NOT stop a
// distributed flood, and on serverless each cold instance starts empty — so
// this is a courtesy throttle, not a security control. If the app ever needs a
// real one, swap the Map for Vercel KV / Upstash behind the same `take()`
// signature; nothing else changes.
//
// Pure except for the injected clock, so it tests like lib/cadence.ts does.

export type RateLimitResult = {
  ok: boolean;
  /** requests remaining in the current window */
  remaining: number;
  /** epoch ms when the current window resets */
  resetAt: number;
  /** seconds to wait before retrying — only meaningful when !ok */
  retryAfter: number;
};

type Window = { count: number; resetAt: number };

export class RateLimiter {
  private readonly hits = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  take(key: string, now: number): RateLimitResult {
    const existing = this.hits.get(key);

    if (!existing || now >= existing.resetAt) {
      const resetAt = now + this.windowMs;
      this.hits.set(key, { count: 1, resetAt });
      return { ok: true, remaining: this.limit - 1, resetAt, retryAfter: 0 };
    }

    if (existing.count >= this.limit) {
      return {
        ok: false,
        remaining: 0,
        resetAt: existing.resetAt,
        retryAfter: Math.ceil((existing.resetAt - now) / 1000),
      };
    }

    existing.count++;
    return {
      ok: true,
      remaining: this.limit - existing.count,
      resetAt: existing.resetAt,
      retryAfter: 0,
    };
  }

  /**
   * Drop windows that have already reset. The Map would otherwise grow one entry
   * per distinct key forever; call this opportunistically from request paths.
   */
  sweep(now: number): void {
    for (const [key, w] of this.hits) {
      if (now >= w.resetAt) this.hits.delete(key);
    }
  }
}

/**
 * Best-effort client identifier. `x-forwarded-for` is set by Vercel (and most
 * proxies); the leftmost entry is the original client. Falls back to a constant
 * so that behind a misconfigured proxy the limiter degrades to a single shared
 * bucket rather than throwing — conservative, which is the right direction for
 * a throttle.
 */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
