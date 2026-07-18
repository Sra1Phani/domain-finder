// createCore — the composition root of the clearance core.
//
// Everything the surfaces need is assembled here from injected dependencies. The
// core reaches for NOTHING on its own: no fetch global, no process.env, no AI
// client. A surface (this web app, a future MCP server, a REST API) constructs
// the real dependencies — reading env, wiring the AI SDK — and hands them in.

import {
  checkMany,
  createRdapProvider,
  withAvailabilityCache,
  DEFAULT_TTLS,
  type AvailabilityCacheTtls,
  type AvailabilityProvider,
  type FetchLike,
} from "./availability";
import {
  generateSuggestions,
  type GenerateConfig,
  type GenerateObjectFn,
  type GenerateOptions,
  type GenerateResult,
} from "./generate";
import { runSearch } from "./search";
import { createMemoryCache, type CacheStore } from "./cache";
import type { AvailabilityResult, SearchRequest, SearchResponse } from "./types";

export type CoreDeps = {
  /**
   * REQUIRED. Network I/O is only ever done through this — the core never
   * touches a fetch global. Surfaces pass the platform fetch (or a fake).
   */
  fetch: FetchLike;
  /** Injected clock (cadence pattern). Defaults to the wall clock. */
  now?: () => Date;
  /** Cache backing. Defaults to an in-memory store on the injected clock. */
  cache?: CacheStore;
  /** Generation config; presence of aiApiKey gates the AI path. */
  config?: GenerateConfig;
  /** Injected AI transport. Absent => generation degrades to rule-based. */
  generateObject?: GenerateObjectFn;
  /** TTLs for the per-domain availability cache. */
  ttls?: AvailabilityCacheTtls;
};

export type Core = {
  /** Availability provider WITH per-domain caching (used by search). */
  provider: AvailabilityProvider;
  /** Availability provider WITHOUT per-domain caching — for callers that need
   * every check fresh (e.g. the watchlist poller). Still shares the long-lived
   * IANA bootstrap cache. */
  rawProvider: AvailabilityProvider;
  check(domain: string): Promise<AvailabilityResult>;
  checkMany(domains: string[], concurrency?: number): Promise<AvailabilityResult[]>;
  generateSuggestions(query: string, opts?: GenerateOptions): Promise<GenerateResult>;
  search(req: SearchRequest): Promise<SearchResponse>;
  /** The cache store in use — exposed so surfaces/tests can inspect or reset. */
  cache: CacheStore;
};

export function createCore(deps: CoreDeps): Core {
  const now = deps.now ?? (() => new Date());
  const cache = deps.cache ?? createMemoryCache(() => now().getTime());
  const config = deps.config ?? {};
  const ttls = deps.ttls ?? DEFAULT_TTLS;
  const fetchFn = deps.fetch;

  const rawProvider = createRdapProvider({ fetch: fetchFn, now, cache });
  const provider = withAvailabilityCache(rawProvider, cache, ttls);

  const gen = (query: string, opts: GenerateOptions = {}) =>
    generateSuggestions(query, opts, {
      config,
      generateObject: deps.generateObject,
      fetch: fetchFn,
      cache,
    });

  const many = (domains: string[], concurrency = 6) =>
    checkMany(domains, concurrency, provider);

  const search = (req: SearchRequest) =>
    runSearch(req, {
      generateSuggestions: gen,
      checkMany: (domains) => many(domains),
      providerName: provider.name,
      now,
    });

  return {
    provider,
    rawProvider,
    check: (d) => provider.check(d),
    checkMany: many,
    generateSuggestions: gen,
    search,
    cache,
  };
}
