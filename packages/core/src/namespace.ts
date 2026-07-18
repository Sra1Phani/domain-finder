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

export type NamespaceDeps = {
  fetch: FetchLike;
  now: () => Date;
  /** Optional GitHub token — raises the rate limit from 60/hr to 5000/hr.
   * Injected by the surface; the core never reads it from the environment. */
  githubToken?: string;
};

export interface NamespaceProvider {
  readonly surface: Surface;
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

export const npmProvider: NamespaceProvider = {
  surface: "npm",
  async check(name, deps) {
    const normalized = name.toLowerCase();
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

export const githubProvider: NamespaceProvider = {
  surface: "github",
  async check(name, deps) {
    const normalized = name.toLowerCase();

    // Short-circuit invalid names WITHOUT touching the API — a name unusable on
    // GitHub is not "free" there.
    if (!isValidGithubLogin(name)) {
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
