// Cross-namespace availability: is a label free as a handle on github / npm /
// pypi? A sibling to the domain availability path — same architecture (a small
// provider interface + injected I/O), deliberately NOT the same interface,
// because the surfaces normalize names differently and fail differently.
//
// The governing rule is the degrade philosophy: a false "available" is the
// dangerous output (someone reserves a name that was actually taken). So ONLY a
// clean 404 from the registry is "available"; anything ambiguous — 5xx, a
// network error, a rate-limit throttle — is "unknown", never "available". And
// "invalid" (the name can't exist on the surface) is distinct from "available".

import type { NamespaceResult, NamespaceStatus, Surface } from "./types";
import type { FetchLike } from "./availability";
import type { CacheStore } from "./cache";
import { mapPool } from "./pool";

export type NamespaceDeps = {
  fetch: FetchLike;
  now: () => Date;
  /** Optional GitHub token — raises the rate limit from 60/hr to 5000/hr.
   * Injected by the surface; the core never reads it from the environment. */
  githubToken?: string;
};

export interface NamespaceProvider {
  readonly surface: Surface;
  /** The surface-normalized form of a name — also the cache key component. */
  normalize(name: string): string;
  check(name: string, deps: NamespaceDeps): Promise<NamespaceResult>;
}

const TIMEOUT_MS = 6000;

function make(
  surface: Surface,
  name: string,
  normalized: string,
  status: NamespaceStatus,
  now: () => Date,
  url?: string,
): NamespaceResult {
  // url is meaningful only when the name is real on the surface (available or
  // taken). For unknown/invalid we don't claim a canonical location.
  const includeUrl = url && (status === "available" || status === "taken");
  return {
    surface,
    name,
    normalized,
    status,
    ...(includeUrl ? { url } : {}),
    checkedAt: now().toISOString(),
  };
}

/**
 * Map an HTTP result to a status under the degrade philosophy:
 * 404 => available, 200 => taken, ANYTHING ELSE => unknown (never available).
 */
function statusFromResponse(status: number): NamespaceStatus {
  if (status === 404) return "available";
  if (status === 200) return "taken";
  return "unknown";
}

// --- npm ---------------------------------------------------------------------

const normalizeNpm = (name: string): string => name.toLowerCase();

export const npmProvider: NamespaceProvider = {
  surface: "npm",
  normalize: normalizeNpm,
  async check(name, deps) {
    const normalized = normalizeNpm(name);

    // Scoped input (@scope/name, or anything with a slash) is out of this cut's
    // scope: URL-encoding the "/" would query a garbage path and could 404 into
    // a false "available". A scoped name is not a plain package name — "invalid".
    if (name.startsWith("@") || name.includes("/")) {
      return make("npm", name, normalized, "invalid", deps.now);
    }

    const url = `https://www.npmjs.com/package/${normalized}`;
    try {
      const res = await deps.fetch(
        `https://registry.npmjs.org/${encodeURIComponent(normalized)}`,
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      return make("npm", name, normalized, statusFromResponse(res.status), deps.now, url);
    } catch {
      return make("npm", name, normalized, "unknown", deps.now);
    }
  },
};

// --- PyPI --------------------------------------------------------------------

/** PEP 503: lowercase, and collapse any run of -, _, . to a single "-". */
function normalizePypi(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

export const pypiProvider: NamespaceProvider = {
  surface: "pypi",
  normalize: normalizePypi,
  async check(name, deps) {
    const normalized = normalizePypi(name);
    const url = `https://pypi.org/project/${normalized}/`;
    try {
      const res = await deps.fetch(
        `https://pypi.org/pypi/${encodeURIComponent(normalized)}/json`,
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      return make("pypi", name, normalized, statusFromResponse(res.status), deps.now, url);
    } catch {
      return make("pypi", name, normalized, "unknown", deps.now);
    }
  },
};

// --- GitHub ------------------------------------------------------------------

// GitHub login rules: alphanumeric with single internal hyphens, no leading or
// trailing hyphen, max 39 chars, case-insensitive. A name that breaks these
// can't be a handle at all — "invalid", not "available".
const GITHUB_LOGIN_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

function isValidGithubLogin(name: string): boolean {
  return name.length >= 1 && name.length <= 39 && GITHUB_LOGIN_RE.test(name);
}

// GitHub reserves a set of logins for its own routes (github.com/<here>). The
// /users API 404s for them — which the naive model would read as "available" —
// but they can never be registered. Surfaced by the cross-namespace live check;
// this is a "don't fabricate available" guard. Case-insensitive.
const GITHUB_RESERVED = new Set([
  "about", "account", "admin", "api", "assets", "blog", "business", "contact",
  "dashboard", "developer", "docs", "download", "downloads", "enterprise",
  "events", "explore", "features", "help", "home", "issues", "jobs", "join",
  "login", "logout", "marketplace", "mobile", "new", "news", "notifications",
  "organizations", "pages", "plans", "pricing", "privacy", "pulls", "register",
  "search", "security", "settings", "shop", "signup", "sponsors", "status",
  "support", "team", "teams", "terms", "tos", "training", "watching", "wiki",
]);

const normalizeGithub = (name: string): string => name.toLowerCase();

export const githubProvider: NamespaceProvider = {
  surface: "github",
  normalize: normalizeGithub,
  async check(name, deps) {
    const normalized = normalizeGithub(name);

    // Short-circuit invalid names WITHOUT touching the API — a name unusable on
    // GitHub is not "free" there. Format failures and reserved logins both count.
    if (!isValidGithubLogin(name) || GITHUB_RESERVED.has(normalized)) {
      return make("github", name, normalized, "invalid", deps.now);
    }

    const url = `https://github.com/${name}`;
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      // GitHub's API rejects requests without a User-Agent (403), so always set it.
      "user-agent": "domain-finder",
    };
    if (deps.githubToken) headers.authorization = `Bearer ${deps.githubToken}`;

    try {
      // /users covers BOTH users and orgs.
      const res = await deps.fetch(`https://api.github.com/users/${normalized}`, {
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      // Rate-limit throttle must read as unknown, never available. A 403/429
      // with the remaining budget at zero is a throttle, not a free handle.
      // (Any non-200/404 already degrades to unknown; this is explicit for
      // clarity and to document the trap.)
      if (res.status === 403 || res.status === 429) {
        return make("github", name, normalized, "unknown", deps.now);
      }

      return make(
        "github",
        name,
        normalized,
        statusFromResponse(res.status),
        deps.now,
        url,
      );
    } catch {
      return make("github", name, normalized, "unknown", deps.now);
    }
  },
};

/** All namespace providers, keyed by surface. */
export const NAMESPACE_PROVIDERS: Record<Surface, NamespaceProvider> = {
  github: githubProvider,
  npm: npmProvider,
  pypi: pypiProvider,
};

// --- caching -----------------------------------------------------------------

export type NamespaceCacheTtls = {
  /** SHORT — a handle can be grabbed at any moment; a stale free is the danger. */
  availableSeconds: number;
  /** Longer — a taken name rarely frees up. */
  takenSeconds: number;
  /** Long — "invalid" is deterministic from the name, it won't change. */
  invalidSeconds: number;
};

export const DEFAULT_NAMESPACE_TTLS: NamespaceCacheTtls = {
  availableSeconds: 60,
  takenSeconds: 3_600,
  invalidSeconds: 86_400,
};

/**
 * TTL for a namespace result by status. `unknown` is NEVER cached — the same
 * rule as the domain path: don't pin a "we couldn't tell".
 */
function ttlForNamespace(status: NamespaceStatus, ttls: NamespaceCacheTtls): number {
  switch (status) {
    case "available":
      return ttls.availableSeconds;
    case "taken":
      return ttls.takenSeconds;
    case "invalid":
      return ttls.invalidSeconds;
    case "unknown":
      return 0; // never cache
  }
}

/**
 * Wrap a provider with a read-through cache keyed by (surface + normalized
 * name). Pass `noopCache` to disable.
 */
export function withNamespaceCache(
  inner: NamespaceProvider,
  cache: CacheStore,
  ttls: NamespaceCacheTtls = DEFAULT_NAMESPACE_TTLS,
): NamespaceProvider {
  return {
    surface: inner.surface,
    normalize: inner.normalize,
    async check(name, deps) {
      const key = `ns:${inner.surface}:${inner.normalize(name)}`;
      const cached = (await cache.get(key)) as NamespaceResult | undefined;
      if (cached) return cached;
      const fresh = await inner.check(name, deps);
      await cache.set(key, fresh, ttlForNamespace(fresh.status, ttls));
      return fresh;
    },
  };
}

// --- coordinator -------------------------------------------------------------

/** Ceiling on concurrent surface checks. Small: there are few surfaces. */
const NAMESPACE_CONCURRENCY = 6;

/**
 * Fan a single name out across the requested surfaces with bounded concurrency,
 * returning one result per surface (order matches `surfaces`). Providers default
 * to the uncached set; createCore passes the cache-wrapped providers.
 */
export async function checkNamespaces(
  name: string,
  surfaces: Surface[],
  deps: NamespaceDeps,
  providers: Record<Surface, NamespaceProvider> = NAMESPACE_PROVIDERS,
): Promise<NamespaceResult[]> {
  return mapPool(surfaces, NAMESPACE_CONCURRENCY, (surface) =>
    providers[surface].check(name, deps),
  );
}
