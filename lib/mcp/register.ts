// Tool registration: schemas, annotations, and the thin wiring from a tool call
// to a handler. Kept separate from the transport (the route) and from the logic
// (handlers.ts) so each stays independently reviewable.
//
// Both tools are FREE and require NO caller credentials — the GitHub token is
// the OPERATOR's, injected server-side. readOnly + no side effects is the
// "safe to connect" property.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Core } from "@domain-finder/core";
import { checkNameHandler, generateNamesHandler } from "./handlers";

const surfaceEnum = z.enum(["github", "npm", "pypi"]);

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
      return {
        content: [{ type: "text" as const, text: out.text }],
        structuredContent: out.structuredContent,
      };
    },
  );
}
