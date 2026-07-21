"use client";

// Shared presentational parts + style helpers, ported from the design's style
// functions. All status styling flows through the tested lib/ui/status module
// (the false-available guard).

import { useState, type CSSProperties, type ReactNode } from "react";
import { statusStyle, isDashed } from "@/lib/ui/status";
import { normalizeRegistrableTld, registrableTlds } from "@/lib/tld-input";
import { T, FONT_DISPLAY, FONT_MONO, radiusS, TLD_OPTIONS } from "@/lib/ui/tokens";

/** Multi-select TLD chips + a free-text "+ add" for any TLD not in the preset
 * list, and a Clear control. Empty selection is allowed — the caller's backend
 * falls back to its default set, and the empty-state hint says so (so it isn't
 * a silent fallback). Custom-added TLDs render as extra chips. */
export function TldChips({
  selected,
  onToggle,
  onAdd,
  onClear,
}: {
  selected: string[];
  onToggle: (tld: string) => void;
  onAdd: (tld: string) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState("");
  // Preset options plus any custom TLD the user added — with restricted/
  // brand-operated TLDs excluded, so the picker only offers registrable ones.
  const chips = registrableTlds([...TLD_OPTIONS, ...selected.filter((t) => !TLD_OPTIONS.includes(t))]);

  const submitDraft = () => {
    const tld = normalizeRegistrableTld(draft);
    if (tld) onAdd(tld);
    setDraft("");
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
      <span
        style={{
          fontSize: 11,
          color: T.faint,
          fontFamily: FONT_MONO,
          textTransform: "uppercase",
          letterSpacing: ".05em",
        }}
      >
        TLDs
      </span>
      {chips.map((tld) => {
        const on = selected.includes(tld);
        return (
          <button
            key={tld}
            type="button"
            onClick={() => onToggle(tld)}
            aria-pressed={on}
            style={{
              fontFamily: FONT_MONO,
              fontSize: 12.5,
              fontWeight: on ? 600 : 500,
              padding: "5px 11px",
              borderRadius: 999,
              cursor: "pointer",
              border: `1px solid ${on ? T.brand : T.line}`,
              background: on ? T.brand : T.card,
              color: on ? "#fff" : T.muted,
            }}
          >
            {tld}
          </button>
        );
      })}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submitDraft();
          }
        }}
        onBlur={submitDraft}
        placeholder="+ add .tld"
        aria-label="Add a custom TLD"
        spellCheck={false}
        autoComplete="off"
        style={{
          fontFamily: FONT_MONO,
          fontSize: 12.5,
          width: 84,
          padding: "5px 11px",
          borderRadius: 999,
          border: `1px dashed ${T.line}`,
          background: T.card,
          color: T.ink,
          outline: "none",
        }}
      />
      {selected.length > 0 ? (
        <button
          type="button"
          onClick={onClear}
          style={{
            fontFamily: FONT_MONO,
            fontSize: 12,
            color: T.faint,
            background: "none",
            border: "none",
            cursor: "pointer",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          Clear
        </button>
      ) : (
        <span style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: T.faint }}>
          none selected — the default set is used
        </span>
      )}
    </div>
  );
}

export function StatusDot({ status, size = 17 }: { status: string; size?: number }) {
  const S = statusStyle(status);
  return (
    <span
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: size,
        height: size,
        borderRadius: 99,
        fontSize: Math.round(size * 0.58),
        fontWeight: 700,
        color: "#fff",
        background: S.solid,
        flexShrink: 0,
        ...(status === "checking" ? { animation: "cl-blink 1s ease-in-out infinite" } : {}),
      }}
    >
      {S.icon}
    </span>
  );
}

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const S = statusStyle(status);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        flexShrink: 0,
        whiteSpace: "nowrap",
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 8px 3px 4px",
        borderRadius: 999,
        color: S.text,
        background: S.bg,
        border: `1px ${isDashed(status) ? "dashed" : "solid"} ${S.border}`,
      }}
    >
      <StatusDot status={status} size={15} />
      {label ?? S.name}
    </span>
  );
}

/** A compact domain tile (grid cell). `meta` is real text only — no fabrication. */
export function StatusTile({
  label,
  status,
  meta,
}: {
  label: string;
  status: string;
  meta?: string;
}) {
  const S = statusStyle(status);
  const checking = status === "checking";
  const invalid = status === "invalid";
  const base: CSSProperties = checking
    ? {
        border: `1px solid ${T.line}`,
        background: `linear-gradient(90deg, ${T.subtle} 25%, ${T.line} 50%, ${T.subtle} 75%)`,
        backgroundSize: "200% 100%",
        animation: "cl-shimmer 1.1s linear infinite",
        minHeight: 46,
        borderRadius: 10,
        padding: "9px 10px 8px",
      }
    : {
        animation: "cl-pop .34s ease both",
        borderRadius: 10,
        padding: "9px 10px 8px",
        border: `1px ${isDashed(status) ? "dashed" : "solid"} ${S.border}`,
        background: S.bg,
        backgroundImage: invalid
          ? `repeating-linear-gradient(135deg, ${S.bg}, ${S.bg} 5px, color-mix(in oklch, ${S.solid} 9%, ${S.bg}) 5px, color-mix(in oklch, ${S.solid} 9%, ${S.bg}) 7px)`
          : "none",
      };
  return (
    <div style={base}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 500, color: T.ink }}>{label}</span>
        {!checking && <StatusDot status={status} size={17} />}
      </div>
      <div
        style={{
          fontSize: 11,
          lineHeight: 1.35,
          marginTop: 4,
          color: checking ? "transparent" : T.muted,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {checking ? "checking…" : meta ?? ""}
      </div>
    </div>
  );
}

/** A registry/legal row (icon tag · label + meta · pill). */
export function SurfaceRow({
  tag,
  label,
  meta,
  status,
  soon = false,
}: {
  tag: string;
  label: string;
  meta?: string;
  status: string;
  soon?: boolean;
}) {
  const checking = status === "checking";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 11px",
        borderRadius: 11,
        border: `1px solid ${T.line}`,
        background: checking ? T.subtle : T.card,
        animation: "cl-pop .3s ease both",
      }}
    >
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: 10,
          fontWeight: 600,
          color: T.muted,
          background: T.subtle,
          border: `1px solid ${T.line}`,
          borderRadius: 7,
          padding: "6px 7px",
          minWidth: 40,
          textAlign: "center",
          flexShrink: 0,
        }}
      >
        {tag}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: T.ink }}>{label}</div>
        <div
          style={{
            fontSize: 11,
            lineHeight: 1.35,
            marginTop: 2,
            color: checking ? "transparent" : T.muted,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {checking ? "checking…" : meta ?? (soon ? "Screening — arriving soon" : "")}
        </div>
      </div>
      <StatusPill status={status} label={soon ? "Soon" : undefined} />
    </div>
  );
}

export function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FONT_MONO,
        fontSize: 10.5,
        letterSpacing: ".07em",
        textTransform: "uppercase",
        color: T.faint,
        margin: "0 0 8px",
      }}
    >
      {children}
    </div>
  );
}

/** Verdict chip (checking N/M, all clear, K of M clear). */
export function VerdictPill({ tone, label }: { tone: string; label: string }) {
  const S = statusStyle(tone);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginTop: 6,
        fontSize: 12,
        fontWeight: 600,
        color: S.text,
        background: S.bg,
        border: `1px solid ${S.border}`,
        padding: "3px 9px",
        borderRadius: 999,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 99, background: S.solid, display: "inline-block" }} />
      {label}
    </div>
  );
}

export function PrimaryButton({
  children,
  type = "button",
  onClick,
  disabled,
}: {
  children: ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
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
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.7 : 1,
        boxShadow: `0 6px 18px color-mix(in oklch, ${T.brand} 30%, transparent)`,
      }}
    >
      {children}
    </button>
  );
}

export function MarkLogo({ size = 30 }: { size?: number }) {
  const inner = Math.round(size * 0.3);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.27),
        background: `linear-gradient(140deg, ${T.brand}, oklch(0.5 0.17 ${T.hue + 30}))`,
        display: "grid",
        placeItems: "center",
        boxShadow: `0 4px 12px color-mix(in oklch, ${T.brand} 35%, transparent)`,
      }}
    >
      <span
        style={{
          width: inner,
          height: inner,
          background: "#fff",
          borderRadius: 2,
          transform: "rotate(45deg)",
          display: "block",
        }}
      />
    </div>
  );
}

/** Source tag chip for generate cards (AI / rule / hack). */
export function SourceTag({ label, tone }: { label: string; tone: { bg: string; color: string; border: string } }) {
  return (
    <span
      style={{
        fontFamily: FONT_MONO,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: ".04em",
        textTransform: "uppercase",
        color: tone.color,
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        padding: "3px 8px",
        borderRadius: 6,
      }}
    >
      {label}
    </span>
  );
}

export { FONT_DISPLAY };
