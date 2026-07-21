// Domain hacks: use the TLD as part of the word itself (bitly -> bit.ly,
// which is the trick Domainr was built on).
//
// This needs no API — just IANA's list of every delegated TLD. For each
// candidate word we look for a zone that matches its tail and split there.
// fetch and the cache are injected; the zone list is static, so it's cached
// with a long TTL rather than a module-global promise.

import type { Suggestion } from "./types";
import type { CacheStore } from "./cache";
import type { FetchLike } from "./availability";
import { isRestrictedTld } from "./tlds";

const IANA_TLDS = "https://data.iana.org/TLD/tlds-alpha-by-domain.txt";
const ZONES_KEY = "iana:zones";
const ZONES_TTL_SECONDS = 86_400;

// A hack only reads well if the remaining stem is a real chunk of word. One or
// two letters ("g.le") is cute but rarely brandable; we require a bit more.
const MIN_STEM = 3;
// A hack's whole appeal is brevity. Past this the split stops reading as a
// word ("bitlylinkshorten.er") and just looks like a mistake.
const MAX_STEM = 10;
// Long zones ("photography") make the split pointless — the hack should be short.
const MAX_ZONE = 4;

export type HackDeps = {
  fetch: FetchLike;
  cache: CacheStore;
};

async function loadZones(fetchFn: FetchLike): Promise<string[]> {
  try {
    const res = await fetchFn(IANA_TLDS, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const text = await res.text();
    return text
      .split("\n")
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l && !l.startsWith("#") && !l.startsWith("xn--"));
  } catch {
    return [];
  }
}

async function getZones(deps: HackDeps): Promise<string[]> {
  const cached = (await deps.cache.get(ZONES_KEY)) as string[] | undefined;
  if (cached) return cached;
  const zones = await loadZones(deps.fetch);
  await deps.cache.set(ZONES_KEY, zones, ZONES_TTL_SECONDS);
  return zones;
}

/**
 * Find hacks for a set of words. A word yields a hack when it ends with a known
 * zone and leaves a stem of at least MIN_STEM characters.
 *
 *   "bitly"    -> bit.ly
 *   "faceboo"  -> (nothing)
 *   "startup"  -> star.tup? no — "tup" isn't a zone
 */
export async function domainHacks(
  words: string[],
  deps: HackDeps,
): Promise<Suggestion[]> {
  const zones = await getZones(deps);
  if (zones.length === 0) return [];

  // Only split on short, openly-registrable zones. The list is already
  // IANA-delegated (loadZones), but some delegated zones are brand-operated
  // (.map, .aws, …) — a "career.map" hack you can never register is noise.
  const byLength = zones.filter((z) => z.length <= MAX_ZONE && !isRestrictedTld(z));
  const out: Suggestion[] = [];
  const seen = new Set<string>();

  for (const word of words) {
    for (const zone of byLength) {
      if (!word.endsWith(zone)) continue;
      const stem = word.slice(0, word.length - zone.length);
      if (stem.length < MIN_STEM || stem.length > MAX_STEM) continue;
      // The stem is its own DNS label, so it must not start/end with a hyphen.
      if (stem.startsWith("-") || stem.endsWith("-")) continue;

      const domain = `${stem}.${zone}`;
      if (seen.has(domain)) continue;
      seen.add(domain);

      out.push({
        domain,
        sld: stem,
        tld: `.${zone}`,
        source: "hack",
        rationale: `domain hack — "${word}" reads across the dot`,
      });
    }
  }

  // Shorter, snappier hacks first.
  return out.sort((a, b) => a.domain.length - b.domain.length);
}
