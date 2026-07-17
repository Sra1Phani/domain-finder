import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { createWatch } from "@/lib/watch";

// RDAP + Postgres both need Node APIs.
export const runtime = "nodejs";
export const maxDuration = 30;

const STATUS_FOR: Record<string, number> = {
  invalid_email: 400,
  invalid_domain: 400,
  unobservable_tld: 422,
  limit_reached: 429,
  already_watching: 409,
};

export async function POST(req: Request) {
  if (!hasDatabase()) {
    return NextResponse.json(
      { error: "The watchlist isn't configured (no DATABASE_URL)." },
      { status: 503 },
    );
  }

  let body: { email?: unknown; domain?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.email !== "string" || typeof body.domain !== "string") {
    return NextResponse.json(
      { error: "Fields 'email' and 'domain' (strings) are required" },
      { status: 400 },
    );
  }

  const result = await createWatch(body.email, body.domain);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: STATUS_FOR[result.code] ?? 400 },
    );
  }

  return NextResponse.json(
    {
      domain: result.domain,
      status: result.status.status,
      bucket: result.status.bucket,
      manageUrl: `/watch/${result.manageToken}`,
    },
    { status: 201 },
  );
}
