// MCP tool handler logic, factored OUT of the transport so it's unit-testable:
// (input, core) -> { structuredContent, text }. The route only wires these into
// registerTool. No clearance logic here — handlers map to core methods and
// format results. Critically: a core "unknown" is passed through as "unknown"
// and NEVER counted as available.

import type { Core, Surface } from "@domain-finder/core";

export type HandlerOutput = {
  structuredContent: Record<string, unknown>;
  /** compact human-readable block for clients that don't parse structuredContent */
  text: string;
  isError?: boolean;
};

// --- check_name --------------------------------------------------------------

export type CheckNameInput = {
  names: string[];
  tlds?: string[];
  surfaces?: Surface[];
};

export async function checkNameHandler(
  input: CheckNameInput,
  core: Core,
): Promise<HandlerOutput> {
  const results = await Promise.all(
    input.names.map(async (name) => {
      const brand = await core.checkBrand(name, {
        tlds: input.tlds,
        surfaces: input.surfaces,
      });

      const domains = brand.domains.map((d) => ({
        domain: d.domain,
        status: d.status,
        bucket: d.bucket,
      }));
      const namespaces = brand.namespaces.map((n) => ({
        surface: n.surface,
        status: n.status,
        normalized: n.normalized,
        ...(n.url ? { url: n.url } : {}),
      }));

      // "taken" = definitively not yours. Note: "unknown" and "invalid" are NOT
      // taken and NOT clear — they just aren't confirmed free.
      const takenOn: string[] = [];
      for (const d of brand.domains) {
        if (d.status !== "available" && d.status !== "unknown") takenOn.push(d.domain);
      }
      for (const n of brand.namespaces) {
        if (n.status === "taken") takenOn.push(n.surface);
      }

      // allClear requires EVERY surface to be confirmed available. An "unknown"
      // anywhere blocks "allClear" — we never claim clear on incomplete info.
      const allClear =
        brand.domains.every((d) => d.status === "available") &&
        brand.namespaces.every((n) => n.status === "available");

      return { name, domains, namespaces, summary: { allClear, takenOn } };
    }),
  );

  const text = results
    .map((r) => {
      const doms = r.domains.map((d) => `${d.domain} ${d.status}`).join(", ");
      const ns = r.namespaces.map((n) => `${n.surface} ${n.status}`).join(", ");
      const verdict = r.summary.allClear
        ? "ALL CLEAR"
        : r.summary.takenOn.length
          ? `taken on: ${r.summary.takenOn.join(", ")}`
          : "not fully clear";
      return `${r.name} — ${verdict}\n  domains: ${doms}\n  namespaces: ${ns}`;
    })
    .join("\n\n");

  return { structuredContent: { results }, text };
}

// --- generate_names ----------------------------------------------------------

export type GenerateNamesInput = {
  description: string;
  count?: number;
  useHacks: boolean;
};

export async function generateNamesHandler(
  input: GenerateNamesInput,
  core: Core,
): Promise<HandlerOutput> {
  const count = input.count ?? 12;

  // Wrap the existing generation. useHacks is passed THROUGH EXPLICITLY — the
  // façade contract test showed an omitted useHacks silently triggers the IANA
  // zone fetch; the surface must be explicit.
  const resp = await core.search({
    query: input.description,
    useAi: true,
    useHacks: input.useHacks,
  });

  const candidates = resp.results.slice(0, count).map((r) => ({
    domain: r.domain,
    sld: r.sld,
    tld: r.tld,
    source: r.source,
    score: r.score,
    status: r.availability.status,
    bucket: r.availability.bucket,
  }));

  const text =
    `${candidates.length} candidates for "${resp.query}" ` +
    `(AI ${resp.meta.aiUsed ? "used" : "unavailable — rule-based"}):\n` +
    candidates
      .map((c) => `  ${c.domain}  [${c.status}]  score ${c.score}`)
      .join("\n") +
    `\n\nNext: call check_name on the favorites for the full ` +
    `cross-namespace (GitHub/npm/PyPI) picture.`;

  return {
    structuredContent: { query: resp.query, aiUsed: resp.meta.aiUsed, candidates },
    text,
  };
}
