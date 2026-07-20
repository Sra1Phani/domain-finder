"use client";

import { useCallback, useState } from "react";
import { Header } from "./Header";
import { Home } from "./Home";
import { Check } from "./Check";
import { Generate } from "./Generate";
import { Watchlist } from "./Watchlist";
import { WatchModal } from "./WatchModal";
import { WatchlistProvider } from "./watchlist-context";
import { T } from "@/lib/ui/tokens";

type View = "home" | "check" | "generate" | "watch";

export default function App() {
  const [view, setView] = useState<View>("home");
  // Name routed in from the home Check door or (later) a Generate candidate.
  const [queued, setQueued] = useState<string | null>(null);
  const consumeQueued = useCallback(() => setQueued(null), []);

  const goCheck = (name?: string) => {
    if (name) setQueued(name);
    setView("check");
  };

  return (
    <WatchlistProvider>
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
          {view === "check" && <Check queuedName={queued} onConsumeQueued={consumeQueued} />}
          {view === "generate" && <Generate onCheckName={(n) => goCheck(n)} />}
          {view === "watch" && <Watchlist onCheck={() => goCheck()} />}
        </main>
        <WatchModal />
      </div>
    </WatchlistProvider>
  );
}
