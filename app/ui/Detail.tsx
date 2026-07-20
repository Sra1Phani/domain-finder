"use client";

import type { CheckNameState } from "@/lib/check-stream";
import { verdictOf } from "@/lib/check-stream";
import { toDetailRows, watchTargetOf, type DetailAcquire } from "@/lib/detail";
import { StatusDot, StatusPill } from "./parts";
import { statusStyle } from "@/lib/ui/status";
import { T, FONT_DISPLAY, FONT_MONO, radius } from "@/lib/ui/tokens";

// The full Name Detail view for a single checked name. Every surface with its
// real status + metadata and an acquire-path CTA; a trademark panel rendered as
// the "coming soon" slot with the not-legal-advice disclaimer always visible;
// and acquirability treatments (restricted / premium / for-sale) that appear
// ONLY when the data is present — same forward-slot discipline as trademark.
export function Detail({
  state,
  onBack,
  onWatch,
}: {
  state: CheckNameState;
  onBack: () => void;
  onWatch: (domain: string, status: string) => void;
}) {
  const v = verdictOf(state);
  const vs = statusStyle(v.tone);
  const rows = toDetailRows(state.surfaces);
  const watchTarget = watchTargetOf(state.surfaces);
  const avail = statusStyle("available");

  return (
    <section style={{ maxWidth: 760, margin: "0 auto" }}>
      <button
        onClick={onBack}
        style={{ fontSize: 13, color: T.muted, background: "none", border: "none", cursor: "pointer", marginBottom: 18, display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        ← Back to check
      </button>

      <div
        style={{
          background: v.allClear ? avail.bg : T.card,
          border: `1px solid ${v.allClear ? avail.border : T.line}`,
          borderRadius: radius,
          padding: "22px 22px",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: T.faint, marginBottom: 6 }}>
              Name report
            </div>
            <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: "clamp(26px,4vw,38px)", letterSpacing: "-.02em", color: T.ink, margin: 0 }}>
              {state.name}
            </h1>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                fontSize: 13,
                fontWeight: 600,
                color: vs.text,
                background: v.allClear ? T.card : vs.bg,
                border: `1px solid ${vs.border}`,
                padding: "6px 12px",
                borderRadius: 999,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 99, background: vs.solid, display: "inline-block" }} />
              {v.label}
            </span>
            {v.done && !v.allClear && watchTarget && (
              <button
                onClick={() => onWatch(watchTarget.domain, watchTarget.status)}
                style={{ fontSize: 12.5, fontWeight: 600, color: statusStyle("parked").text, background: statusStyle("parked").bg, border: `1px solid ${statusStyle("parked").border}`, borderRadius: 999, padding: "6px 13px", cursor: "pointer" }}
              >
                ◔ Watch {watchTarget.domain}
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 9 }}>
        {rows.map((r) => {
          const tag = r.type === "domain" ? r.surface.slice(r.surface.indexOf(".")) : r.surface;
          return (
            <div
              key={r.surface}
              style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", borderRadius: 12, border: `1px solid ${T.line}`, background: T.card, flexWrap: "wrap" }}
            >
              <span style={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, color: T.muted, background: T.subtle, border: `1px solid ${T.line}`, borderRadius: 7, padding: "6px 7px", minWidth: 40, textAlign: "center" }}>
                {tag}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{r.label}</div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.meta}</div>
                {r.acquire && <AcquireTag acquire={r.acquire} />}
              </div>
              <StatusPill status={r.status} />
              {r.cta && (
                <a
                  href={r.cta.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    textDecoration: "none",
                    borderRadius: 8,
                    padding: "7px 11px",
                    border: r.status === "available" ? "none" : `1px solid ${T.line}`,
                    color: r.status === "available" ? "#fff" : T.muted,
                    background: r.status === "available" ? T.brand : T.subtle,
                  }}
                >
                  {r.cta.label}
                </a>
              )}
            </div>
          );
        })}
      </div>

      {/* Trademark screening — a forward "coming soon" slot, with the disclaimer
          always visible. No verdict is fabricated. */}
      <div style={{ marginTop: 22, border: `1px solid ${T.line}`, borderRadius: radius, overflow: "hidden", background: T.card }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "15px 18px", borderBottom: `1px solid ${T.line}`, background: T.subtle }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 9, background: statusStyle("soon").solid, color: "#fff", fontSize: 16 }}>
              ™
            </span>
            <div>
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 16, color: T.ink }}>Trademark screening</div>
              <div style={{ fontSize: 12, color: T.muted }}>
                Risk verdict ·{" "}
                <span style={{ fontFamily: FONT_MONO, fontSize: 10, border: `1px solid ${T.line}`, padding: "1px 5px", borderRadius: 4, color: T.faint }}>
                  COMING SOON
                </span>
              </div>
            </div>
          </div>
          <StatusDot status="soon" size={17} />
        </div>
        <div style={{ padding: "14px 18px" }}>
          <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, margin: "0 0 12px" }}>
            Automated mark screening across the goods/services classes isn&apos;t connected yet — this
            panel will show the risk verdict and supporting evidence once the trademark provider is
            wired.
          </p>
          <div style={{ padding: "10px 12px", borderRadius: 9, background: T.subtle, border: `1px solid ${T.line}`, fontSize: 11.5, color: T.muted, display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ color: T.faint }}>⚠</span>
            <span>
              This is automated screening,{" "}
              <strong style={{ color: T.ink, fontWeight: 600 }}>not legal advice</strong>. Confirm any
              brand decision with a trademark attorney.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function AcquireTag({ acquire }: { acquire: DetailAcquire }) {
  if (acquire.kind === "restricted") {
    const S = statusStyle("invalid");
    return (
      <span style={tagStyle(S.bg, S.text, S.border)}>
        ⛔ Restricted TLD — brand-operated, not open for registration
      </span>
    );
  }
  if (acquire.kind === "premium") {
    const S = statusStyle("parked");
    return <span style={tagStyle(S.bg, S.text, S.border)}>★ Premium registration</span>;
  }
  // forSale
  const S = statusStyle("parked");
  const price = acquire.price != null ? `$${acquire.price.toLocaleString()}` : "make an offer";
  return (
    <span style={tagStyle(S.bg, S.text, S.border)}>
      For sale · {price}
      {acquire.href && (
        <a href={acquire.href} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, color: "inherit", textDecoration: "underline" }}>
          Buy
        </a>
      )}
    </span>
  );
}

function tagStyle(bg: string, color: string, border: string) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
    fontSize: 11,
    fontWeight: 600,
    color,
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: 6,
    padding: "3px 8px",
  } as const;
}
