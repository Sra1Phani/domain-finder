"use client";

import { useEffect, useRef, useState } from "react";
import {
  applyCheckEvent,
  consumeNdjson,
  initialNameState,
  verdictOf,
  type CheckNameState,
} from "@/lib/check-stream";
import type { CheckEvent } from "@/lib/check-events";
import { pickVariations, type GenerateCandidate } from "@/lib/generate-dto";
import type { SearchResponse } from "@domain-finder/core";
import { StatusTile, SurfaceRow, VerdictPill, GroupLabel, TldChips, StatusDot, AvailableOnlyToggle } from "./parts";
import { Detail } from "./Detail";
import { useWatchlist } from "./watchlist-context";
import { useAvailableOnly } from "./available-only";
import { watchTargetOf } from "@/lib/detail";
import { byTldValue } from "@/lib/tld-order";
import { filterAvailable } from "@/lib/available-filter";
import { statusStyle } from "@/lib/ui/status";
import { T, FONT_DISPLAY, FONT_MONO, radius, radiusS, DEFAULT_TLDS_UI } from "@/lib/ui/tokens";

const EXAMPLES = ["namescope", "quillbase", "fathomly", "orbitkit", "lumen"];

type Entry = { id: number; name: string; state: CheckNameState };

export function Check({
  queuedName,
  onConsumeQueued,
}: {
  queuedName: string | null;
  onConsumeQueued: () => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [tlds, setTlds] = useState<string[]>(DEFAULT_TLDS_UI);
  const [detailId, setDetailId] = useState<number | null>(null);
  const seq = useRef(0);
  const { openWatch } = useWatchlist();
  const [availOnly, toggleAvailOnly] = useAvailableOnly();

  const toggleTld = (tld: string) =>
    setTlds((prev) => (prev.includes(tld) ? prev.filter((t) => t !== tld) : [...prev, tld]));
  const addTld = (tld: string) => setTlds((prev) => (prev.includes(tld) ? prev : [...prev, tld]));
  const clearTlds = () => setTlds([]);
  // Synchronous dedupe guard — survives StrictMode's double-invoked effects
  // (a closure check on `entries` would see stale [] twice and duplicate).
  const active = useRef<Set<string>>(new Set());

  const update = (id: number, fn: (s: CheckNameState) => CheckNameState) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, state: fn(e.state) } : e)));

  async function runCheck(id: number, name: string, checkTlds: string[]) {
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, tlds: checkTlds }),
      });
      if (!res.ok || !res.body) {
        update(id, (s) => applyCheckEvent(s, { kind: "error", message: `Check failed (${res.status})` }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let carry = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const { events, carry: c } = consumeNdjson(decoder.decode(value, { stream: true }), carry);
        carry = c;
        for (const ev of events) update(id, (s) => applyCheckEvent(s, ev as CheckEvent));
      }
      const { events } = consumeNdjson("\n", carry); // flush any trailing line
      for (const ev of events) update(id, (s) => applyCheckEvent(s, ev as CheckEvent));
    } catch {
      update(id, (s) => applyCheckEvent(s, { kind: "error", message: "Stream connection failed." }));
    }
  }

  function addName(raw: string) {
    const name = raw.trim().toLowerCase().replace(/\s+/g, "-");
    if (!name || active.current.has(name)) return;
    active.current.add(name);
    const id = ++seq.current;
    setEntries((prev) => [{ id, name, state: initialNameState(name) }, ...prev]);
    void runCheck(id, name, tlds);
  }

  function removeEntry(id: number, name: string) {
    active.current.delete(name);
    setEntries((prev) => prev.filter((x) => x.id !== id));
    setDetailId((d) => (d === id ? null : d));
  }

  function clearAll() {
    active.current.clear();
    setEntries([]);
    setDetailId(null);
  }

  // Names routed in from the home Check door / a Generate candidate. addName
  // closes over `entries`, so we reach it via a latest-ref to keep the effect's
  // deps honest (no exhaustive-deps suppression).
  const addRef = useRef(addName);
  addRef.current = addName;
  useEffect(() => {
    if (queuedName) {
      addRef.current(queuedName);
      onConsumeQueued();
    }
  }, [queuedName, onConsumeQueued]);

  const detailEntry = detailId != null ? entries.find((e) => e.id === detailId) : undefined;
  if (detailEntry) {
    return (
      <Detail
        state={detailEntry.state}
        onBack={() => setDetailId(null)}
        onWatch={openWatch}
      />
    );
  }

  return (
    <section>
      <div style={{ maxWidth: 640 }}>
        <h1
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: "clamp(26px,4vw,38px)",
            lineHeight: 1.05,
            letterSpacing: "-.02em",
            color: T.ink,
            margin: "0 0 10px",
            textWrap: "balance",
          }}
        >
          Check a name across every surface.
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: T.muted, margin: "0 0 20px", maxWidth: 520 }}>
          Domains, GitHub, npm, PyPI — and trademark soon. Watch each surface resolve on its own.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addName(input);
          setInput("");
        }}
        style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch", maxWidth: 640 }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 220,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: T.card,
            border: `1.5px solid ${T.line}`,
            borderRadius: radiusS,
            padding: "0 16px",
            boxShadow: "0 1px 2px rgba(20,18,40,.04)",
          }}
        >
          <span style={{ fontFamily: FONT_MONO, color: T.faint, fontSize: 15 }}>›</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="type a name — e.g. namescope"
            autoComplete="off"
            spellCheck={false}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily: FONT_MONO,
              fontSize: 16,
              color: T.ink,
              padding: "15px 0",
              minWidth: 0,
            }}
          />
        </div>
        <button
          type="submit"
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
            cursor: "pointer",
            boxShadow: `0 6px 18px color-mix(in oklch, ${T.brand} 30%, transparent)`,
          }}
        >
          Check name
        </button>
      </form>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 14, maxWidth: 640 }}>
        <span style={{ fontSize: 12.5, color: T.faint }}>Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => addName(ex)}
            style={{
              fontFamily: FONT_MONO,
              fontSize: 12.5,
              color: T.muted,
              background: T.subtle,
              border: `1px solid ${T.line}`,
              borderRadius: 999,
              padding: "5px 11px",
              cursor: "pointer",
            }}
          >
            {ex}
          </button>
        ))}
        {entries.length > 0 && (
          <button
            onClick={clearAll}
            style={{
              marginLeft: "auto",
              fontSize: 12.5,
              color: T.faint,
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            Clear all
          </button>
        )}
      </div>

      <div style={{ marginTop: 14, maxWidth: 640, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <TldChips selected={tlds} onToggle={toggleTld} onAdd={addTld} onClear={clearTlds} />
        <AvailableOnlyToggle on={availOnly} onToggle={toggleAvailOnly} />
      </div>

      {entries.length === 0 ? (
        <div
          style={{
            marginTop: 40,
            border: `1.5px dashed ${T.line}`,
            borderRadius: radius,
            padding: "40px 26px",
            textAlign: "center",
            background: T.subtle,
          }}
        >
          <div style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: T.faint, letterSpacing: ".04em" }}>
            ▁▁▁ awaiting a name ▁▁▁
          </div>
          <p style={{ fontSize: 14, color: T.muted, margin: "12px auto 0", maxWidth: 400, lineHeight: 1.55 }}>
            Enter a candidate above. Each surface resolves on its own — you&apos;ll watch them stream
            in one by one.
          </p>
        </div>
      ) : (
        <div
          style={{
            marginTop: 34,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))",
            gap: 18,
            alignItems: "start",
          }}
        >
          {entries.map((e) => (
            <NameCard
              key={e.id}
              entry={e}
              onRemove={() => removeEntry(e.id, e.name)}
              onOpenDetail={() => setDetailId(e.id)}
              onWatch={openWatch}
              onCheckName={addName}
              availOnly={availOnly}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function NameCard({
  entry,
  onRemove,
  onOpenDetail,
  onWatch,
  onCheckName,
  availOnly,
}: {
  entry: Entry;
  onRemove: () => void;
  onOpenDetail: () => void;
  onWatch: (domain: string, status: string) => void;
  onCheckName: (name: string) => void;
  availOnly: boolean;
}) {
  const { state } = entry;
  const v = verdictOf(state);
  // Order domain tiles by TLD value (.com before .xyz), a stable display sort
  // independent of the completion order the surfaces resolve in.
  const domains = state.surfaces
    .filter((s) => s.type === "domain")
    .slice()
    .sort((a, b) => byTldValue(a.tld ?? a.surface, b.tld ?? b.surface));
  // "Available only" is a pure view filter over the already-checked tiles.
  const shownDomains = filterAvailable(domains, availOnly);
  const registries = state.surfaces.filter((s) => s.type === "registry");
  const anyTaken = state.surfaces.some((s) => s.status === "taken" || s.status === "parked");
  const watchTarget = watchTargetOf(state.surfaces);
  // A "dead end": resolved, and not one checked domain is free to register.
  const deadEnd = v.done && domains.length > 0 && !domains.some((d) => d.status === "available");
  const availBorder = statusStyle("available");

  return (
    <div
      style={{
        background: T.card,
        border: `1px solid ${v.allClear ? availBorder.border : T.line}`,
        borderRadius: radius,
        boxShadow: v.allClear
          ? `0 8px 30px color-mix(in oklch, ${availBorder.solid} 18%, transparent)`
          : "0 2px 12px rgba(20,18,40,.05)",
        overflow: "hidden",
        transition: "box-shadow .3s",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, padding: "16px 18px 12px" }}>
        <div style={{ minWidth: 0 }}>
          <span
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 600,
              fontSize: 20,
              color: T.ink,
              letterSpacing: "-.01em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "block",
            }}
          >
            {state.name}
          </span>
          <VerdictPill tone={v.tone} label={v.label} />
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button
            onClick={onOpenDetail}
            title="Open the full name report"
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: T.brand,
              background: T.brandSoft,
              border: "none",
              borderRadius: 8,
              padding: "6px 10px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Details
          </button>
          <button
            onClick={onRemove}
            title="Remove"
            style={{
              fontSize: 15,
              lineHeight: 1,
              color: T.faint,
              background: T.subtle,
              border: `1px solid ${T.line}`,
              borderRadius: 8,
              width: 30,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
      </div>

      <div style={{ padding: "0 18px 14px" }}>
        <div style={{ height: 6, borderRadius: 99, background: T.subtle, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${v.pct}%`,
              background: v.allClear ? availBorder.solid : T.brand,
              borderRadius: 99,
              transition: "width .5s ease",
            }}
          />
        </div>
      </div>

      {state.error && (
        <div style={{ margin: "0 18px 14px", padding: "12px 14px", borderRadius: radiusS, background: statusStyle("unknown").bg, border: `1px solid ${statusStyle("unknown").border}`, fontSize: 13, color: statusStyle("unknown").text }}>
          {state.error}
        </div>
      )}

      {v.allClear && (
        <div
          style={{
            margin: "0 18px 14px",
            padding: "12px 14px",
            borderRadius: radiusS,
            background: availBorder.bg,
            border: `1px solid ${availBorder.border}`,
            display: "flex",
            alignItems: "center",
            gap: 11,
            animation: "cl-burst .5s ease both",
          }}
        >
          <div style={{ width: 30, height: 30, borderRadius: 99, background: availBorder.solid, color: "#fff", display: "grid", placeItems: "center", fontSize: 16, flexShrink: 0 }}>
            ✓
          </div>
          <div>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 15, color: availBorder.text }}>
              All clear — this name is yours to take.
            </div>
            <div style={{ fontSize: 12, color: availBorder.text, opacity: 0.8 }}>Free on every checked surface.</div>
          </div>
        </div>
      )}

      <div style={{ padding: "2px 18px 6px" }}>
        <GroupLabel>Domains{availOnly ? " · available only" : ""}</GroupLabel>
        {availOnly && v.done && shownDomains.length === 0 ? (
          <div style={{ fontSize: 12.5, color: T.muted, fontFamily: FONT_MONO, padding: "4px 0 2px" }}>
            No available domains here — see free alternatives below.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(96px,1fr))", gap: 8 }}>
            {shownDomains.map((s) => (
              <StatusTile key={s.surface} label={s.tld ?? s.label} status={s.status} meta={s.meta} />
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: "10px 18px 6px" }}>
        <GroupLabel>Developer registries</GroupLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
          {registries.map((s) => (
            <SurfaceRow key={s.surface} tag={s.surface} label={s.label} meta={s.meta} status={s.status} />
          ))}
        </div>
      </div>

      <div style={{ padding: "10px 18px 16px" }}>
        <GroupLabel>Legal</GroupLabel>
        {/* Trademark isn't in the stream yet — a real "coming soon" affordance. */}
        <SurfaceRow tag="™" label="Trademark class" status="soon" soon />
      </div>

      {v.done && !v.allClear && anyTaken && watchTarget && (
        <div style={{ borderTop: `1px dashed ${T.line}`, padding: "13px 18px 16px", background: T.subtle }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 12, color: T.muted }}>
              <span style={{ fontFamily: FONT_MONO }}>{watchTarget.domain}</span> is taken — watch it
              and we&apos;ll email you if it frees up:
            </span>
            <button
              onClick={() => onWatch(watchTarget.domain, watchTarget.status)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: statusStyle("parked").text,
                background: statusStyle("parked").bg,
                border: `1px solid ${statusStyle("parked").border}`,
                borderRadius: 999,
                padding: "4px 11px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              ◔ Watch
            </button>
          </div>
        </div>
      )}

      {/* No dead ends: when nothing is free, pre-checked variations seeded from
          this name (via the existing generation engine), available-first. */}
      {deadEnd && <Variations name={state.name} onCheck={onCheckName} />}
    </div>
  );
}

// Pre-checked "names close to X that are free" — reuses /api/search seeded with
// the name (no new generation logic) and shows only its AVAILABLE results.
// Self-fetches once on mount; also used by the available-only empty state.
export function Variations({
  name,
  onCheck,
  compact = false,
}: {
  name: string;
  onCheck: (name: string) => void;
  compact?: boolean;
}) {
  const [vs, setVs] = useState<{ loading: boolean; error: boolean; items: GenerateCandidate[] }>({
    loading: true,
    error: false,
    items: [],
  });
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    fetch("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: name, useAi: true, useHacks: true }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as SearchResponse;
      })
      .then((d) => setVs({ loading: false, error: false, items: pickVariations(d, 6) }))
      .catch(() => setVs({ loading: false, error: true, items: [] }));
  }, [name]);

  const availStyle = statusStyle("available");
  return (
    <div
      style={{
        borderTop: `1px dashed ${T.line}`,
        padding: compact ? "12px 0 2px" : "13px 18px 16px",
        background: compact ? "transparent" : T.subtle,
      }}
    >
      <div style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: ".04em", textTransform: "uppercase", color: T.faint, marginBottom: 9 }}>
        Names close to {name} that are free
      </div>
      {vs.loading ? (
        <span style={{ fontSize: 12.5, color: T.muted, fontFamily: FONT_MONO }}>finding names that are free…</span>
      ) : vs.error ? (
        <span style={{ fontSize: 12.5, color: T.muted }}>Couldn&apos;t fetch alternatives — try again.</span>
      ) : vs.items.length === 0 ? (
        <span style={{ fontSize: 12.5, color: T.muted }}>
          No free variations found — try a different root word.
        </span>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {vs.items.map((c) => (
            <button
              key={c.name}
              onClick={() => onCheck(c.checkName)}
              title={`Check ${c.checkName}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontFamily: FONT_MONO,
                fontSize: 12.5,
                color: availStyle.text,
                background: availStyle.bg,
                border: `1px solid ${availStyle.border}`,
                borderRadius: 999,
                padding: "5px 11px",
                cursor: "pointer",
              }}
            >
              <StatusDot status="available" size={13} />
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
