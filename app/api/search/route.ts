import { NextResponse } from "next/server";
import { search } from "@/lib/core";
import { VIBES, type SearchRequest, type Vibe } from "@domain-finder/core";
import { RateLimiter, clientKey } from "@/lib/rate-limit";

// RDAP calls + optional AI use Node APIs and can take a few seconds.
export const runtime = "nodejs";
export const maxDuration = 60;

// A query longer than this can't be a product description — it's either an
// accident (pasted a file) or an attempt to run up the AI token bill, since the
// raw query is interpolated into the model prompt. Reject before doing any work.
const MAX_QUERY_LEN = 200;

// Each search fans out to ~45 RDAP calls against registries we don't pay for, so
// the endpoint is the cheapest way to burn the goodwill the watchlist depends
// on. Throttle per client. Module-scoped so it survives across requests on a
// warm instance; see lib/rate-limit.ts for what this does and doesn't cover.
const limiter = new RateLimiter(20, 60_000); // 20 searches / minute / client

export async function POST(req: Request) {
  const now = Date.now();
  limiter.sweep(now);
  const rl = limiter.take(clientKey(req), now);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many searches — give it a minute." },
      { status: 429, headers: { "retry-after": String(rl.retryAfter) } },
    );
  }

  let body: Partial<SearchRequest>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body.query !== "string" || !body.query.trim()) {
    return NextResponse.json(
      { error: "Field 'query' (string) is required" },
      { status: 400 },
    );
  }

  if (body.query.length > MAX_QUERY_LEN) {
    return NextResponse.json(
      { error: `Describe your idea in ${MAX_QUERY_LEN} characters or fewer.` },
      { status: 400 },
    );
  }

  // Only accept a known vibe; anything else falls back to the neutral default.
  const vibe: Vibe | undefined =
    typeof body.vibe === "string" && (VIBES as string[]).includes(body.vibe)
      ? (body.vibe as Vibe)
      : undefined;

  const result = await search({
    query: body.query,
    tlds: Array.isArray(body.tlds) ? body.tlds : undefined,
    useAi: body.useAi,
    useHacks: body.useHacks,
    vibe,
    short: body.short === true,
  });

  return NextResponse.json(result);
}
