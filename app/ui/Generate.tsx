"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { toCandidates, filterBySource, type GenerateCandidate, type SourceFilter } from "@/lib/generate-dto";
import type { SearchResponse, Vibe } from "@domain-finder/core";
import { SourceTag, StatusDot, TldChips } from "./parts";
import { statusStyle } from "@/lib/ui/status";
import { T, FONT_DISPLAY, FONT_MONO, radius, radiusS, DEFAULT_TLDS_UI } from "@/lib/ui/tokens";

const VIBES: { value: Vibe; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "playful", label: "Playful" },
  { value: "serious", label: "Serious" },
  { value: "techy", label: "Techy" },
];

const SOURCE_FILTERS: { key: SourceFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ai", label: "AI" },
  { key: "rule", label: "Rule" },
  { key: "hack", label: "Hacks" },
];

// Shown when the active single-source filter has zero candidates — a clear
// message beats a blank panel that reads as broken.
const EMPTY_LABEL: Record<Exclude<SourceFilter, "all">, string> = {
  ai: "No AI names for this one",
  rule: "No rule-based names for this one",
  hack: "No domain-hacks for this one",
};

function sourceTone(source: GenerateCandidate["source"]) {
  if (source === "rule-based") {
    const S = statusStyle("available");
    return { bg: S.bg, color: S.text, border: S.border };
  }
  if (source === "domain-hack") {
    const S = statusStyle("parked");
    return { bg: S.bg, color: S.text, border: S.border };
  }
  return { bg: T.brandSoft, color: T.brand, border: T.brandBorder };
}

function tldOf(domain: string): string {
  const dot = domain.indexOf(".");
  return dot >= 0 ? domain.slice(dot) : "";
}

export function Generate({ onCheckName }: { onCheckName: (name: string) => void }) {
  const [description, setDescription] = useState("");
  const [candidates, setCandidates] = useState<GenerateCandidate[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [shortlist, setShortlist] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ran, setRan] = useState(false);
  const [tlds, setTlds] = useState<string[]>(DEFAULT_TLDS_UI);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [vibe, setVibe] = useState<Vibe>("any");
  const [short, setShort] = useState(false);

  const toggleTld = (tld: string) =>
    setTlds((prev) =>
      prev.includes(tld) ? (prev.length > 1 ? prev.filter((t) => t !== tld) : prev) : [...prev, tld],
    );

  async function runGenerate() {
    const query = description.trim();
    if (!query || loading) return;
    setLoading(true);
    setError(null);
    setDismissed(new Set());
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, useAi: true, useHacks: true, tlds, vibe, short }),
      });
      if (!res.ok) {
        setError(`Generation failed (${res.status}).`);
        setCandidates([]);
      } else {
        const data = (await res.json()) as SearchResponse;
        setCandidates(toCandidates(data));
      }
    } catch {
      setError("Couldn’t reach the generator. Try again.");
      setCandidates([]);
    } finally {
      setLoading(false);
      setRan(true);
    }
  }

  const toggle = (set: Set<string>, key: string): Set<string> => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  // Two pure view filters over the already-loaded list — dismissals, then the
  // source segmented control. No refetch: switching filters never hits /api.
  const kept = candidates.filter((c) => !dismissed.has(c.name));
  const visible = filterBySource(kept, sourceFilter);
  const hacksOnly = sourceFilter === "hack";
  const steerChip = (on: boolean): CSSProperties => ({
    fontFamily: "inherit",
    fontSize: 12.5,
    fontWeight: on ? 600 : 500,
    padding: "5px 12px",
    borderRadius: 999,
    border: `1px solid ${on ? T.brand : T.line}`,
    background: on ? T.brand : T.card,
    color: on ? "#fff" : T.muted,
    cursor: "pointer",
  });

  return (
    <section style={{ maxWidth: 820, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: T.brand, marginBottom: 12 }}>
          Describe it — the names come to you
        </div>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: "clamp(28px,4.5vw,40px)", lineHeight: 1.06, letterSpacing: "-.02em", color: T.ink, margin: 0 }}>
          What are you building?
        </h1>
      </div>

      <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: radius, padding: 16, boxShadow: "0 4px 20px rgba(20,18,40,.05)" }}>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
          placeholder="A tool that helps founders name their startup and check if it's available everywhere…"
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            resize: "none",
            background: "transparent",
            fontFamily: "inherit",
            fontSize: 16,
            lineHeight: 1.5,
            color: T.ink,
            minHeight: 74,
          }}
        />
        <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 12, marginTop: 4 }}>
          {/* Domain-hacks read across the dot (recip.es) and so ignore the TLD
              selection entirely. When "Hacks" is the active filter, dim the chips
              AND say so — dimming alone doesn't explain why they're inert. */}
          <div
            aria-disabled={hacksOnly}
            style={{
              opacity: hacksOnly ? 0.4 : 1,
              pointerEvents: hacksOnly ? "none" : "auto",
              transition: "opacity .15s ease",
            }}
          >
            <TldChips selected={tlds} onToggle={toggleTld} />
          </div>
          {hacksOnly && (
            <div style={{ fontSize: 11.5, color: T.faint, fontFamily: FONT_MONO, marginTop: 8 }}>
              Domain-hacks ignore TLD selection — they read across the dot.
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingTop: 12, marginTop: 4 }}>
          {/* Steering — tunes the AI tone and the rule-based affix pool; "short
              only" drops longer labels before TLD expansion. Applied on the
              next Generate run. */}
          <span style={{ fontSize: 11, color: T.faint, fontFamily: FONT_MONO, textTransform: "uppercase", letterSpacing: ".05em" }}>
            Vibe
          </span>
          {VIBES.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => setVibe(v.value)}
              aria-pressed={vibe === v.value}
              style={steerChip(vibe === v.value)}
            >
              {v.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShort((s) => !s)}
            aria-pressed={short}
            style={steerChip(short)}
          >
            short only
          </button>
          <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.faint, marginLeft: "auto" }}>{description.length} / 200</span>
          <button
            onClick={runGenerate}
            disabled={loading || !description.trim()}
            style={{
              fontFamily: "inherit",
              fontSize: 15,
              fontWeight: 600,
              color: "#fff",
              background: T.brand,
              border: "none",
              borderRadius: radiusS,
              padding: "0 22px",
              minHeight: 50,
              cursor: loading || !description.trim() ? "default" : "pointer",
              opacity: loading || !description.trim() ? 0.7 : 1,
              boxShadow: `0 6px 18px color-mix(in oklch, ${T.brand} 30%, transparent)`,
            }}
          >
            {loading ? "Generating…" : candidates.length ? "Generate again" : "Generate names"}
          </button>
        </div>
      </div>

      {shortlist.size > 0 && (
        <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: T.brandSoft, border: `1px solid ${T.brandBorder}`, borderRadius: radiusS, padding: "10px 14px" }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: T.brand }}>★ Shortlist ({shortlist.size})</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
            {[...shortlist].map((n) => (
              <span key={n} style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: T.ink, background: T.card, border: `1px solid ${T.brandBorder}`, borderRadius: 999, padding: "3px 10px" }}>
                {n}
              </span>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 18, padding: "12px 14px", borderRadius: radiusS, background: statusStyle("unknown").bg, border: `1px solid ${statusStyle("unknown").border}`, fontSize: 13.5, color: statusStyle("unknown").text }}>
          {error}
        </div>
      )}

      {candidates.length > 0 && !loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: T.faint, fontFamily: FONT_MONO, textTransform: "uppercase", letterSpacing: ".05em" }}>Source</span>
          <div style={{ display: "inline-flex", gap: 3, background: T.subtle, border: `1px solid ${T.line}`, borderRadius: 999, padding: 3 }}>
            {SOURCE_FILTERS.map(({ key, label }) => {
              const on = sourceFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSourceFilter(key)}
                  aria-pressed={on}
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 12.5,
                    fontWeight: on ? 600 : 500,
                    padding: "5px 14px",
                    borderRadius: 999,
                    cursor: "pointer",
                    border: "none",
                    background: on ? T.card : "transparent",
                    color: on ? T.brand : T.muted,
                    boxShadow: on ? "0 1px 3px rgba(20,18,40,.09)" : "none",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {visible.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(226px,1fr))", gap: 14, marginTop: 14 }}>
          {visible.map((c, i) => {
            const tone = sourceTone(c.source);
            const starred = shortlist.has(c.name);
            const S = statusStyle(c.status);
            return (
              <div
                key={c.name}
                style={{
                  background: T.card,
                  border: `1px solid ${starred ? T.brandBorder : T.line}`,
                  borderRadius: radius,
                  padding: 16,
                  boxShadow: starred ? `0 4px 16px color-mix(in oklch, ${T.brand} 14%, transparent)` : "none",
                  animation: "cl-rise .42s cubic-bezier(.2,.7,.3,1) both",
                  animationDelay: `${Math.min(i, 10) * 55}ms`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <SourceTag label={c.source} tone={tone} />
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <button
                      onClick={() => setShortlist((s) => toggle(s, c.name))}
                      title="Shortlist"
                      style={{
                        fontSize: 13,
                        lineHeight: 1,
                        color: starred ? "#fff" : T.faint,
                        background: starred ? T.brand : T.subtle,
                        border: `1px solid ${starred ? T.brand : T.line}`,
                        borderRadius: 7,
                        width: 26,
                        height: 26,
                        cursor: "pointer",
                      }}
                    >
                      ★
                    </button>
                    <button
                      onClick={() => setDismissed((s) => toggle(s, c.name))}
                      title="Dismiss"
                      style={{ fontSize: 14, lineHeight: 1, color: T.faint, background: T.subtle, border: `1px solid ${T.line}`, borderRadius: 7, width: 26, height: 26, cursor: "pointer" }}
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 21, color: T.ink, letterSpacing: "-.01em", marginTop: 11 }}>
                  {c.name}
                </div>
                <p style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5, margin: "7px 0 0", minHeight: 38, textWrap: "pretty" }}>
                  {c.rationale || "—"}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 11 }}>
                  {/* Generation returns DOMAIN availability only — one honest signal. */}
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontFamily: FONT_MONO,
                      fontSize: 11,
                      color: S.text,
                      background: S.bg,
                      border: `1px ${c.status === "unknown" ? "dashed" : "solid"} ${S.border}`,
                      borderRadius: 6,
                      padding: "2px 7px",
                    }}
                    title={`${tldOf(c.domain)}: ${S.name}`}
                  >
                    <StatusDot status={c.status} size={13} />
                    {tldOf(c.domain)} {S.name.toLowerCase()}
                  </span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.faint, marginLeft: "auto" }}>score {c.score}</span>
                </div>
                <button
                  onClick={() => onCheckName(c.checkName)}
                  style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: "#fff", background: T.brand, border: "none", borderRadius: 9, padding: 9, cursor: "pointer", width: "100%" }}
                >
                  Check this name →
                </button>
              </div>
            );
          })}
        </div>
      )}

      {candidates.length > 0 && !loading && visible.length === 0 && sourceFilter !== "all" && (
        <div
          style={{
            marginTop: 14,
            textAlign: "center",
            fontSize: 14,
            color: T.muted,
            border: `1.5px dashed ${T.line}`,
            borderRadius: radius,
            padding: "30px 16px",
          }}
        >
          {EMPTY_LABEL[sourceFilter]} — try another source.
        </div>
      )}

      {ran && !loading && visible.length > 0 && (
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button
            onClick={runGenerate}
            style={{ fontSize: 13.5, fontWeight: 600, color: T.ink, background: T.card, border: `1px solid ${T.line}`, borderRadius: 999, padding: "9px 20px", cursor: "pointer" }}
          >
            ↻ Regenerate a fresh batch
          </button>
        </div>
      )}

      {ran && !loading && candidates.length === 0 && !error && (
        <div style={{ marginTop: 24, textAlign: "center", fontSize: 14, color: T.muted }}>
          No candidates for that description — try adding a keyword or two.
        </div>
      )}
    </section>
  );
}
