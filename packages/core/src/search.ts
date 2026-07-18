// Orchestrator: query -> generate candidates -> check availability -> rank.
//
// Pure over injected collaborators — it knows nothing about HTTP, the AI client,
// or how availability is fetched. createCore wires the concrete pieces in.

import { rankSuggestions } from "./rank";
import type { AvailabilityResult, SearchRequest, SearchResponse } from "./types";
import type { GenerateOptions, GenerateResult } from "./generate";

export type SearchCtx = {
  generateSuggestions: (query: string, opts: GenerateOptions) => Promise<GenerateResult>;
  checkMany: (domains: string[]) => Promise<AvailabilityResult[]>;
  providerName: string;
  now: () => Date;
};

export async function runSearch(
  req: SearchRequest,
  ctx: SearchCtx,
): Promise<SearchResponse> {
  const started = ctx.now().getTime();
  const query = req.query.trim();

  if (!query) {
    return {
      query,
      results: [],
      meta: {
        generated: 0,
        checked: 0,
        aiUsed: false,
        availabilityProvider: ctx.providerName,
        tookMs: 0,
      },
    };
  }

  const { suggestions, aiUsed } = await ctx.generateSuggestions(query, {
    tlds: req.tlds,
    useAi: req.useAi,
    useHacks: req.useHacks,
  });

  const availability = await ctx.checkMany(suggestions.map((s) => s.domain));
  const results = rankSuggestions(suggestions, availability);

  return {
    query,
    results,
    meta: {
      generated: suggestions.length,
      checked: availability.length,
      aiUsed,
      availabilityProvider: ctx.providerName,
      tookMs: ctx.now().getTime() - started,
    },
  };
}
