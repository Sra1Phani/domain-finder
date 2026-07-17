import { NextResponse } from "next/server";
import { search } from "@/lib/search";
import type { SearchRequest } from "@/lib/types";

// RDAP calls + optional AI use Node APIs and can take a few seconds.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
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

  const result = await search({
    query: body.query,
    tlds: Array.isArray(body.tlds) ? body.tlds : undefined,
    useAi: body.useAi,
    useHacks: body.useHacks,
  });

  return NextResponse.json(result);
}
