// Streaming Check API — NDJSON over a ReadableStream on the Node runtime.
//
// One JSON event per line, flushed AS IT OCCURS (each surface as it settles),
// so the Stage-2 UI can render results in completion order rather than waiting
// for the slowest surface. This is a SURFACE: it constructs core via makeCore()
// (env read here, exactly like the MCP route) and maps stream events to the
// stable CheckEvent contract. Not wired into any UI — it's the contract Stage 2
// builds against.

import { makeCore } from "@/lib/core";
import { streamCheck, type CheckEvent } from "@/lib/check-events";

export const runtime = "nodejs";
export const maxDuration = 60;
// Never let a cached response stand in for a live check.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // Non-JSON body -> streamCheck will emit a structured error event.
    body = {};
  }

  const core = makeCore();
  const encoder = new TextEncoder();
  const write = (controller: ReadableStreamDefaultController, ev: CheckEvent) =>
    controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of streamCheck(core, (body ?? {}) as Record<string, unknown>)) {
          write(controller, ev); // flush per event
        }
      } catch {
        // Defensive: never crash the stream mid-flight — emit a final error line.
        write(controller, { kind: "error", message: "Check stream failed." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      // Defeat proxy/CDN buffering so events reach the client as they occur.
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
