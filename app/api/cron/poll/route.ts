// The scheduled poller's HTTP surface.
//
// Vercel Hobby cron only fires once per day, which can't deliver the 6h/hourly
// cadence a pendingDelete domain needs. So this route is driven by an external
// scheduler (GitHub Actions — see .github/workflows/poll.yml) and guarded by a
// shared secret rather than by Vercel's cron identity.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { hasDatabase } from "@/lib/db";
import { pollDue } from "@/lib/poll";

export const runtime = "nodejs";
export const maxDuration = 300;
// Never let a cached response stand in for an actual poll.
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";

  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  // timingSafeEqual throws on length mismatch, so check that first — the length
  // of the secret isn't itself a secret.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ error: "No DATABASE_URL configured" }, { status: 503 });
  }

  const started = Date.now();
  try {
    const summary = await pollDue();
    return NextResponse.json({ ...summary, tookMs: Date.now() - started });
  } catch (err) {
    console.error("poll failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Poll failed" },
      { status: 500 },
    );
  }
}
