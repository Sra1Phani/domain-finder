// Tool registration: schemas, annotations, and the thin wiring from a tool call
// to a handler. Kept separate from the transport (the route) and from the logic
// (handlers.ts) so each stays independently reviewable.
//
// Both tools are FREE and require NO caller credentials — the GitHub token is
// the OPERATOR's, injected server-side. readOnly + no side effects is the
// "safe to connect" property.

import { z } from "zod";
import { after } from "next/server";
import { headers } from "next/headers";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Core } from "@domain-finder/core";
import { checkNameHandler, generateNamesHandler } from "./handlers";
import { logRequest, hashClient } from "../request-log";

const surfaceEnum = z.enum(["github", "npm", "pypi"]);

/**
 * Best-effort client hash for an MCP call. The request headers aren't guaranteed
 * to be reachable from every transport, so fall back to null rather than failing
 * the tool.
 */
async function mcpClientHash(): Promise<string | null> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    const ip = fwd ? fwd.split(",")[0]!.trim() : (h.get("x-real-ip")?.trim() ?? null);
    return hashClient(ip);
  } catch {
    return null;
  }
}

/** Schedule a best-effort log of one MCP tool call after the response is sent. */
function logMcpCall(
  operation: string,
  input: unknown,
  output: unknown,
  clientHash: string | null,
): void {
  const entry = { surface: "mcp" as const, operation, input, output, clientHash };
  try {
    after(() => logRequest(entry));
  } catch {
    void logRequest(entry);
  }
}

export function registerTools(server: McpServer, core: Core): void {
  server.registerTool(
    "check_name",
    {
      title: "Check brand-name availability across domains + namespaces",
      description:
        "Check whether one or more candidate names are free to use as a brand — across domains and the GitHub / npm / PyPI namespaces — in a single call.",
      inputSchema: {
        names: z.array(z.string().min(1)).min(1).max(10),
        tlds: z.array(z.string()).optional(),
        surfaces: z.array(surfaceEnum).optional(),
      },
      outputSchema: {
        results: z.array(
          z.object({
            name: z.string(),
            domains: z.array(
              z.object({
                domain: z.string(),
                status: z.string(),
                bucket: z.string(),
              }),
            ),
            namespaces: z.array(
              z.object({
                surface: z.string(),
                status: z.string(),
                normalized: z.string(),
                url: z.string().optional(),
              }),
            ),
            summary: z.object({
              allClear: z.boolean(),
              takenOn: z.array(z.string()),
            }),
          }),
        ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const out = await checkNameHandler(args, core);
      logMcpCall("check_name", args, out.structuredContent, await mcpClientHash());
      return {
        content: [{ type: "text" as const, text: out.text }],
        structuredContent: out.structuredContent,
      };
    },
  );

  server.registerTool(
    "generate_names",
    {
      title: "Generate candidate names, pre-checked for domain availability",
      description:
        "Generate candidate names from a description, each pre-checked for domain availability. Then call check_name on the favorites for the full cross-namespace picture.",
      inputSchema: {
        description: z.string().min(1),
        count: z.number().int().min(1).max(50).optional(),
        useHacks: z.boolean().default(false),
      },
      outputSchema: {
        query: z.string(),
        aiUsed: z.boolean(),
        candidates: z.array(
          z.object({
            domain: z.string(),
            sld: z.string(),
            tld: z.string(),
            source: z.string(),
            score: z.number(),
            status: z.string(),
            bucket: z.string(),
          }),
        ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const out = await generateNamesHandler(args, core);
      logMcpCall("generate_names", args, out.structuredContent, await mcpClientHash());
      return {
        content: [{ type: "text" as const, text: out.text }],
        structuredContent: out.structuredContent,
      };
    },
  );
}
