import type { CSSProperties } from "react";
import { MarkLogo } from "./parts";
import { T, FONT_DISPLAY, FONT_MONO, WORDMARK } from "@/lib/ui/tokens";

type View = "home" | "check" | "generate" | "watch";

const tabBase: CSSProperties = {
  fontFamily: "inherit",
  fontSize: 13.5,
  fontWeight: 600,
  border: "none",
  borderRadius: 9,
  padding: "7px 14px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
};
const tab = (on: boolean): CSSProperties =>
  on
    ? { ...tabBase, background: T.card, color: T.ink, boxShadow: "0 1px 3px rgba(20,18,40,.1)" }
    : { ...tabBase, background: "transparent", color: T.muted };

export function Header({
  view,
  onHome,
  onGenerate,
  onCheck,
  onWatch,
}: {
  view: View;
  onHome: () => void;
  onGenerate: () => void;
  onCheck: () => void;
  onWatch: () => void;
}) {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        padding: "14px 22px",
        background: `color-mix(in oklch, ${T.canvas} 82%, transparent)`,
        backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${T.line}`,
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 11, cursor: "pointer" }}
        onClick={onHome}
      >
        <MarkLogo size={30} />
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 600,
            fontSize: 18,
            letterSpacing: "-.01em",
            color: T.ink,
          }}
        >
          {WORDMARK}
        </span>
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color: T.faint,
            border: `1px solid ${T.line}`,
            padding: "2px 6px",
            borderRadius: 5,
          }}
        >
          beta
        </span>
      </div>
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          background: T.subtle,
          padding: 4,
          borderRadius: 12,
          border: `1px solid ${T.line}`,
        }}
      >
        <button onClick={onGenerate} style={tab(view === "generate")}>
          Generate
        </button>
        <button onClick={onCheck} style={tab(view === "check")}>
          Check
        </button>
        <button onClick={onWatch} style={tab(view === "watch")}>
          Watchlist
        </button>
      </nav>
    </header>
  );
}
