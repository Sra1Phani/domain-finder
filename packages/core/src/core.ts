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
import {
  checkNamespaces,
  githubProvider,
  npmProvider,
  pypiProvider,
  withNamespaceCache,
  DEFAULT_NAMESPACE_TTLS,
  type NamespaceCacheTtls,
  type NamespaceDeps,
  type NamespaceProvider,
} from "./namespace";
import {
  checkBrand,
  streamBrand,
  type BrandOptions,
  type BrandResult,
  type BrandStreamEvent,
} from "./brand";
import { createMemoryCache, type CacheStore } from "./cache";
import type {
  AvailabilityResult,
  NamespaceResult,
  SearchRequest,
  SearchResponse,
  Surface,
} from "./types";

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
  /** Optional GitHub token for namespace checks — injected, never read from env. */
  githubToken?: string;
  /** TTLs for the namespace (github/npm/pypi) cache. */
  namespaceTtls?: NamespaceCacheTtls;
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
  /** Cache-wrapped namespace providers, keyed by surface. */
  namespaceProviders: Record<Surface, NamespaceProvider>;
  /** Check a label across surfaces (defaults to all three). */
  checkNamespaces(name: string, surfaces?: Surface[]): Promise<NamespaceResult[]>;
  /** Compose domain + namespace availability for a single brand name. */
  checkBrand(name: string, opts?: BrandOptions): Promise<BrandResult>;
  /** Same fan-out as checkBrand, streamed: each result yielded as it settles. */
  streamBrand(name: string, opts?: BrandOptions): AsyncGenerator<BrandStreamEvent>;
  /** The cache store in use — exposed so surfaces/tests can inspect or reset. */
  cache: CacheStore;
};

const ALL_SURFACES: Surface[] = ["github", "npm", "pypi"];

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

  // Namespace (github/npm/pypi): cache-wrapped providers over the same store,
  // and deps carrying the injected github token.
  const nsTtls = deps.namespaceTtls ?? DEFAULT_NAMESPACE_TTLS;
  const nsDeps: NamespaceDeps = { fetch: fetchFn, now, githubToken: deps.githubToken };
  const namespaceProviders: Record<Surface, NamespaceProvider> = {
    github: withNamespaceCache(githubProvider, cache, nsTtls),
    npm: withNamespaceCache(npmProvider, cache, nsTtls),
    pypi: withNamespaceCache(pypiProvider, cache, nsTtls),
  };
  const doCheckNamespaces = (name: string, surfaces: Surface[] = ALL_SURFACES) =>
    checkNamespaces(name, surfaces, nsDeps, namespaceProviders);

  const doCheckBrand = (name: string, opts: BrandOptions = {}) =>
    checkBrand(name, opts, {
      // Discovery benefits from the cached domain provider.
      checkDomains: (domains) => many(domains),
      checkNamespaces: doCheckNamespaces,
    });

  const doStreamBrand = (name: string, opts: BrandOptions = {}) =>
    streamBrand(name, opts, {
      checkDomain: (domain) => provider.check(domain),
      checkNamespace: (n, surface) => namespaceProviders[surface].check(n, nsDeps),
    });

  return {
    provider,
    rawProvider,
    check: (d) => provider.check(d),
    checkMany: many,
    generateSuggestions: gen,
    search,
    namespaceProviders,
    checkNamespaces: doCheckNamespaces,
    checkBrand: doCheckBrand,
    streamBrand: doStreamBrand,
    cache,
  };
}
