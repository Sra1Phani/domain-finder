# Security

## Posture

Domain Finder's public surface is the remote MCP server at `/api/mcp`. It is
deliberately low-risk to connect to:

- **Read-only tools.** `check_name` and `generate_names` only look things up
  (RDAP, and the GitHub / npm / PyPI registries). They perform no writes, no
  purchases, and no side effects. The tools are annotated `readOnlyHint: true`.
- **No caller credentials.** Neither tool accepts a secret, token, or account
  from the caller. There is nothing for a client to leak.
- **Operator secrets stay server-side.** Any secrets the deployment uses (e.g.
  a GitHub token to raise the namespace rate limit, or AI-gateway credentials)
  are read only from the server environment and injected into the core; they are
  never accepted from, returned to, or otherwise exposed to callers. The core
  library itself reads no environment variables — that boundary is enforced in
  the build (an ESLint rule) so it can't regress.

## Reporting a vulnerability

If you find a security issue, please report it privately rather than opening a
public issue. Use GitHub's **Report a vulnerability** flow (Security → Advisories
→ Report a vulnerability) on this repository. Please include steps to reproduce
and the affected endpoint or tool. We'll acknowledge receipt and follow up with a
fix or mitigation timeline.
