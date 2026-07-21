// Candidate generation: rule-based combinations + optional AI brainstorming.
//
// Both paths produce *labels* (second-level names, no TLD). They're merged,
// normalised, deduped, then expanded across the requested TLDs into concrete
// domain candidates for availability checking.
//
// The AI call is INJECTED, and its availability is gated by injected config
// rather than a process.env read — so the exact "degrade to rule-based when no
// credentials" behavior is preserved, but the core never reads the environment
// and never hardcodes the AI client. The zod schema and prompt (the generation
// logic) stay here in the core; only the transport (generateObject) is injected.

import { z } from "zod";
import { DEFAULT_TLDS } from "./tlds";
import type { Suggestion, SuggestionSource, Vibe } from "./types";
import type { FetchLike } from "./availability";
import type { CacheStore } from "./cache";
import { domainHacks } from "./hacks";

/** Labels longer than this are dropped when the caller asks for "short only". */
export const SHORT_MAX_LEN = 12;

const DEFAULT_AI_MODEL = "anthropic/claude-haiku-4-5";

/** Injected AI transport, shaped after the AI SDK's generateObject. */
export type GenerateObjectFn = <T>(args: {
  model: string;
  schema: z.ZodType<T>;
  prompt: string;
}) => Promise<{ object: T }>;

/** Replaces generate.ts's old process.env reads. Presence of aiApiKey gates AI. */
export type GenerateConfig = {
  aiModel?: string;
  /** When absent, generation degrades to rule-based (exactly as before). */
  aiApiKey?: string;
};

export type GenerateDeps = {
  config: GenerateConfig;
  generateObject?: GenerateObjectFn;
  fetch: FetchLike;
  cache: CacheStore;
};

// --- label hygiene -----------------------------------------------------------

// A valid DNS label: 1–63 chars, letters/digits/hyphen, no leading/trailing
// hyphen. We additionally require length >= 2 for brandability.
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function normalizeLabel(raw: string): string | null {
  const cleaned = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/^-+|-+$/g, "");
  if (cleaned.length < 2 || cleaned.length > 63) return null;
  if (!LABEL_RE.test(cleaned)) return null;
  return cleaned;
}

// Common words that make poor brand roots — dropped before combining.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "with", "your",
  "my", "our", "app", "site", "web", "online", "that", "this", "is", "are",
  "who", "which", "busy", "good", "best", "new", "using", "use", "can", "will",
]);

function keywords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .slice(0, 4);
}

// --- rule-based path ---------------------------------------------------------

const PREFIXES = ["get", "try", "go", "use", "join", "my"];

// Affix pools per vibe — the rule-based counterpart to the AI tone steering.
// "any" is the broad default; the others lean the generated labels toward a
// feel (playful/serious/techy). Prefixes stay constant; the suffix set is what
// carries most of the flavor.
const SUFFIXES_BY_VIBE: Record<Vibe, string[]> = {
  any: ["ly", "hq", "app", "hub", "ify", "labs", "kit", "flow", "base", "now", "wise", "spot"],
  playful: ["ly", "oo", "zy", "pop", "kit", "bud", "boo", "doo", "go", "yay"],
  serious: ["hq", "labs", "works", "group", "core", "base", "systems", "point", "co", "one"],
  techy: ["ify", "flow", "stack", "byte", "sync", "node", "io", "dev", "grid", "ops"],
};

export function ruleBasedLabels(query: string, vibe: Vibe = "any"): string[] {
  const words = keywords(query);
  if (words.length === 0) return [];

  const suffixes = SUFFIXES_BY_VIBE[vibe] ?? SUFFIXES_BY_VIBE.any;
  const out = new Set<string>();
  const push = (s: string) => {
    const n = normalizeLabel(s);
    if (n) out.add(n);
  };

  const joined = words.join("");
  push(joined);
  if (words.length >= 2) push(words[0] + words[1]);

  for (const w of words) {
    push(w);
    for (const s of suffixes) push(w + s);
    for (const p of PREFIXES) push(p + w);
  }
  if (words.length >= 2) {
    for (const s of suffixes) push(joined + s);
    for (const p of PREFIXES) push(p + joined);
  }

  // Shorter labels first — they make better brands.
  return [...out].sort((a, b) => a.length - b.length);
}

// --- AI path -----------------------------------------------------------------

type AiLabel = { label: string; rationale: string };

// Tone instruction appended to the AI prompt per vibe. "any" adds nothing.
const VIBE_TONE: Record<Vibe, string> = {
  any: "",
  playful: " Tone: playful and friendly — fun, approachable, a little whimsical.",
  serious: " Tone: serious and professional — credible, trustworthy, enterprise-ready.",
  techy: " Tone: technical and modern — developer-oriented, with a systems/infra feel.",
};

async function aiLabels(
  query: string,
  count: number,
  deps: Pick<GenerateDeps, "config" | "generateObject">,
  vibe: Vibe = "any",
): Promise<AiLabel[]> {
  const { config, generateObject } = deps;
  // Exact degrade-to-rule-based behavior: no credentials (or no injected
  // transport) => no AI, empty result, caller falls back to rule-based.
  if (!config.aiApiKey || !generateObject) return [];
  try {
    const { object } = await generateObject({
      model: config.aiModel ?? DEFAULT_AI_MODEL,
      schema: z.object({
        names: z
          .array(
            z.object({
              name: z
                .string()
                .describe(
                  "brandable second-level label, lowercase, letters/digits/hyphens only, NO TLD",
                ),
              rationale: z
                .string()
                .describe(
                  "<= 14 words tying the name to THIS idea — reference a word or the meaning from the description, not generic praise",
                ),
            }),
          )
          .max(count),
      }),
      prompt:
        `Brainstorm ${count} brandable, memorable domain name ideas ` +
        `(second-level labels only, no ".com") for this product/idea:\n\n` +
        `"${query}"\n\n` +
        `Rules: short (aim <= 15 chars), easy to spell and say, lowercase, ` +
        `letters and digits only, avoid hyphens unless they clearly help. ` +
        `Mix literal descriptors with inventive/coined names. For each name, the ` +
        `rationale must connect it specifically to this idea (reference a keyword ` +
        `or the meaning above) — avoid generic praise like "brandable and catchy".` +
        (VIBE_TONE[vibe] ?? ""),
    });
    return object.names.map((n) => ({ label: n.name, rationale: n.rationale }));
  } catch {
    // Missing/invalid key, model error, timeout — degrade to rule-based only.
    return [];
  }
}

// --- merge + expand ----------------------------------------------------------

export type GenerateOptions = {
  tlds?: string[];
  useAi?: boolean;
  /**
   * Include domain hacks (bit.ly). Note these deliberately ignore the `tlds`
   * filter — a hack's zone is dictated by the word itself, which is the point.
   */
  useHacks?: boolean;
  /** steer name style (AI tone + rule-based affixes); defaults to "any" */
  vibe?: Vibe;
  /** keep only short labels (<= SHORT_MAX_LEN chars) */
  short?: boolean;
  /** hard cap on concrete domain candidates returned */
  maxCandidates?: number;
  /** cap on distinct labels before TLD expansion */
  maxLabels?: number;
};

export type GenerateResult = {
  suggestions: Suggestion[];
  aiUsed: boolean;
};

/** Hacks are the most distinctive results, but shouldn't crowd out the rest. */
const MAX_HACKS = 8;

export async function generateSuggestions(
  query: string,
  opts: GenerateOptions,
  deps: GenerateDeps,
): Promise<GenerateResult> {
  const tlds = opts.tlds?.length ? opts.tlds : DEFAULT_TLDS;
  const maxCandidates = opts.maxCandidates ?? 45;
  const maxLabels = opts.maxLabels ?? 24;
  const vibe: Vibe = opts.vibe ?? "any";

  const aiResults =
    opts.useAi === false ? [] : await aiLabels(query, 12, deps, vibe);
  const aiUsed = aiResults.length > 0;

  // AI labels lead (they carry rationale and are usually more brandable),
  // rule-based fills in behind them. Map keeps first-seen source/rationale.
  const labels = new Map<
    string,
    { source: SuggestionSource; rationale?: string }
  >();

  for (const r of aiResults) {
    const n = normalizeLabel(r.label);
    if (n && !labels.has(n)) labels.set(n, { source: "ai", rationale: r.rationale });
  }
  // Rule-based labels get an idea-specific rationale (references a keyword from
  // the description), not generic praise — mirroring what we ask the AI for.
  const kws = keywords(query);
  const ruleRationale = kws.length
    ? `Built from "${kws[0]}" in your idea — familiar and quick to say.`
    : undefined;
  for (const l of ruleBasedLabels(query, vibe)) {
    if (!labels.has(l)) labels.set(l, { source: "rule", rationale: ruleRationale });
  }

  // "short only" — drop longer labels before TLD expansion. Applied to labels,
  // not hacks (a hack's length is dictated by the word and it's short already).
  const kept = opts.short
    ? [...labels.entries()].filter(([sld]) => sld.length <= SHORT_MAX_LEN)
    : [...labels.entries()];
  const ordered = kept.slice(0, maxLabels);

  // Domain hacks, drawn from the query's own words plus any AI-coined labels
  // ("meally" -> meal.ly). They lead the list: they're the most distinctive
  // thing we produce and there are never many.
  const suggestions: Suggestion[] = [];
  if (opts.useHacks !== false) {
    // Individual words and AI-coined labels only — the joined multi-word form
    // ("bitlylinkshorten") just yields noise once split.
    const hackWords = [
      ...keywords(query),
      ...ordered.filter(([, m]) => m.source === "ai").map(([sld]) => sld),
    ];
    const hacks = await domainHacks(hackWords, { fetch: deps.fetch, cache: deps.cache });
    suggestions.push(...hacks.slice(0, MAX_HACKS));
  }

  const seen = new Set(suggestions.map((s) => s.domain));

  // Round-robin over TLDs so every label gets its .com before any label gets a
  // second TLD — keeps the candidate set diverse under the cap.
  for (let ti = 0; ti < tlds.length && suggestions.length < maxCandidates; ti++) {
    for (const [sld, meta] of ordered) {
      if (suggestions.length >= maxCandidates) break;
      const domain = sld + tlds[ti];
      if (seen.has(domain)) continue;
      seen.add(domain);
      suggestions.push({
        domain,
        sld,
        tld: tlds[ti],
        source: meta.source,
        rationale: meta.rationale,
      });
    }
  }

  return { suggestions, aiUsed };
}
