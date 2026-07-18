// MCP server surface — a stateless Streamable-HTTP endpoint at /api/mcp.
//
// This is a SURFACE: it may import next and read env (via makeCore). It holds
// no clearance logic — it constructs the core from env-injected deps and maps
// tool calls to core methods (see lib/mcp/register.ts + handlers.ts).
//
// Both tools are free, read-only, and require no caller credentials — the
// GitHub token is the operator's, injected server-side. No auth/metering here;
// that arrives with the future metered tool (the registerTool `_meta` field is
// the seam for per-response cost/tier info when it does).

import { createMcpHandler } from "mcp-handler";
import { makeCore } from "@/lib/core";
import { registerTools } from "@/lib/mcp/register";

export const runtime = "nodejs";
export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    // Construct the core per request from env-injected deps, then register tools.
    registerTools(server, makeCore());
  },
  {
    serverInfo: { name: "domain-finder", version: "0.1.0" },
  },
  {
    // basePath "/api" + the [transport] segment => the endpoint is /api/mcp.
    basePath: "/api",
    maxDuration: 60,
    // No redisUrl: stateless. (Redis only adds SSE resumability, not needed here.)
  },
);

export { handler as GET, handler as POST };
