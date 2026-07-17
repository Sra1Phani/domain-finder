// Orchestrator: query -> generate candidates -> check availability -> rank.

import { availabilityProvider, checkMany } from "./availability";
import { generateSuggestions } from "./generate";
import { rankSuggestions } from "./rank";
import type { SearchRequest, SearchResponse } from "./types";

export async function search(req: SearchRequest): Promise<SearchResponse> {
  const started = Date.now();
  const query = req.query.trim();

  if (!query) {
    return {
      query,
      results: [],
      meta: {
        generated: 0,
        checked: 0,
        aiUsed: false,
        availabilityProvider: availabilityProvider.name,
        tookMs: 0,
      },
    };
  }

  const { suggestions, aiUsed } = await generateSuggestions(query, {
    tlds: req.tlds,
    useAi: req.useAi,
    useHacks: req.useHacks,
  });

  const availability = await checkMany(suggestions.map((s) => s.domain));
  const results = rankSuggestions(suggestions, availability);

  return {
    query,
    results,
    meta: {
      generated: suggestions.length,
      checked: availability.length,
      aiUsed,
      availabilityProvider: availabilityProvider.name,
      tookMs: Date.now() - started,
    },
  };
}
