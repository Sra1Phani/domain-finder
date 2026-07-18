// Surface wiring for the clearance core.
//
// This is the ONE place the web app reads the environment and binds the AI SDK,
// then hands concrete dependencies to createCore. The core itself stays pure;
// env lives here, in the surface.

import { generateObject as aiGenerateObject } from "ai";
import { createCore, type GenerateObjectFn } from "@domain-finder/core";

// Adapt the AI SDK's generateObject to the core's injected transport contract.
// The gateway auth (AI_GATEWAY_API_KEY locally / OIDC on Vercel) is picked up by
// the SDK from the environment here in the surface, not in the core.
const generateObject: GenerateObjectFn = (args) =>
  aiGenerateObject({
    model: args.model,
    schema: args.schema,
    prompt: args.prompt,
  });

const core = createCore({
  fetch: (url, init) => fetch(url, init),
  now: () => new Date(),
  config: {
    aiModel: process.env.DOMAIN_AI_MODEL,
    // Presence gates the AI path — mirrors the old hasAiCredentials() check.
    aiApiKey: process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN,
  },
  generateObject,
  // GitHub namespace checks: the token is read HERE (surface), injected into
  // core. Without it, GitHub is limited to 60 req/hr per IP; with it, 5000/hr.
  githubToken: process.env.GITHUB_TOKEN,
});

// Search benefits from the per-domain availability cache (core.provider).
export const search = core.search;

// The watchlist poller and watch-creation want every check FRESH, so they use
// the uncached provider — preserving their pre-refactor behavior. (It still
// shares the long-lived IANA bootstrap cache.)
export const availabilityProvider = core.rawProvider;

// Cross-namespace availability (github/npm/pypi), cache-wrapped with the
// injected token. Surface API for a future route/MCP tool.
export const checkNamespaces = core.checkNamespaces;
