import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { deleteWatchByToken, getWatchByToken } from "@/lib/watch";

// RDAP + Postgres both need Node APIs; never serve a cached status.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read a single watch's live status BY TOKEN. The unguessable manage token is
// the only credential — there is deliberately no list-by-email surface, since
// that would expose every address's watchlist. We return ONLY this one watch's
// status: never the siblings or the email that getWatchByToken also carries.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!hasDatabase()) {
    return NextResponse.json({ error: "The watchlist isn't configured." }, { status: 503 });
  }
  const { token } = await params;
  const watch = await getWatchByToken(token);
  if (!watch) {
    return NextResponse.json({ error: "No watch for that token." }, { status: 404 });
  }
  const { current } = watch;
  return NextResponse.json({
    domain: watch.domain,
    status: current.status,
    state: watch.state,
    expiresAt: current.expiresAt?.toISOString() ?? null,
    lastCheckedAt: current.lastCheckedAt?.toISOString() ?? null,
    nextCheckAt: current.nextCheckAt?.toISOString() ?? null,
  });
}

// Stop a watch. The token authorizes the deletion (same credential model).
export async function DELETE(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!hasDatabase()) {
    return NextResponse.json({ error: "The watchlist isn't configured." }, { status: 503 });
  }
  const { token } = await params;
  const ok = await deleteWatchByToken(token);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
