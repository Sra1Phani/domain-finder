"use client";

import { useState } from "react";
import { Header } from "./Header";
import { Home } from "./Home";
import { T, FONT_DISPLAY, FONT_MONO, radius } from "@/lib/ui/tokens";

type View = "home" | "check" | "generate" | "watch";

// Honest intermediate placeholder for flows not yet wired in this commit. Not
// fake product data — a plain "arriving next" note.
function Stub({ title, note }: { title: string; note: string }) {
  return (
    <section
      style={{
        maxWidth: 640,
        margin: "40px auto",
        border: `1.5px dashed ${T.line}`,
        borderRadius: radius,
        padding: "40px 26px",
        textAlign: "center",
        background: T.subtle,
      }}
    >
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 20, color: T.ink, marginBottom: 8 }}>
        {title}
      </div>
      <p style={{ fontSize: 14, color: T.muted, margin: 0, lineHeight: 1.55 }}>{note}</p>
      <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.faint, marginTop: 12, letterSpacing: ".04em" }}>
        wiring in progress
      </div>
    </section>
  );
}

export default function App() {
  const [view, setView] = useState<View>("home");
  // Name routed in from the home Check door or (later) a Generate candidate.
  const [, setQueued] = useState<string | null>(null);

  const goCheck = (name?: string) => {
    if (name) setQueued(name);
    setView("check");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.canvas,
        color: T.ink,
        fontFamily: "inherit",
      }}
    >
      <Header
        view={view}
        onHome={() => setView("home")}
        onGenerate={() => setView("generate")}
        onCheck={() => goCheck()}
        onWatch={() => setView("watch")}
      />
      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "34px 22px 90px", width: "100%" }}>
        {view === "home" && (
          <Home onGenerate={() => setView("generate")} onCheck={(n) => goCheck(n)} onWatch={() => setView("watch")} />
        )}
        {view === "check" && (
          <Stub title="Check a name across every surface" note="The live streaming reveal wires up in the next commit." />
        )}
        {view === "generate" && (
          <Stub title="Describe it — the names come to you" note="Candidate generation wires up in a following commit." />
        )}
        {view === "watch" && (
          <Stub
            title="Watchlist"
            note="Re-check names on a schedule and get alerted when one frees up — arriving in Stage 3."
          />
        )}
      </main>
    </div>
  );
}
