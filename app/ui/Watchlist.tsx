"use client";

import { useEffect, useRef, useState } from "react";
import { useWatchlist } from "./watchlist-context";
import { toWatchRow, type WatchStatusResponse } from "@/lib/watch-status";
import { StatusPill } from "./parts";
import { T, FONT_DISPLAY, FONT_MONO, radius } from "@/lib/ui/tokens";

type Remote = { loading: boolean; error: boolean; data: WatchStatusResponse | null };

export function Watchlist({ onCheck }: { onCheck: () => void }) {
  const { watches, cap, atCap, removeByToken } = useWatchlist();
  const [remotes, setRemotes] = useState<Record<string, Remote>>({});
  // Tokens we've already kicked off a fetch for — keeps the effect's deps honest
  // (no need to read `remotes` inside it) and avoids refetching on every change.
  const fetched = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const wch of watches) {
      if (fetched.current.has(wch.token)) continue;
      fetched.current.add(wch.token);
      setRemotes((r) => ({ ...r, [wch.token]: { loading: true, error: false, data: null } }));
      fetch(`/api/watch/${wch.token}`)
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status));
          return (await res.json()) as WatchStatusResponse;
        })
        .then((data) =>
          setRemotes((r) => ({ ...r, [wch.token]: { loading: false, error: false, data } })),
        )
        .catch(() =>
          setRemotes((r) => ({ ...r, [wch.token]: { loading: false, error: true, data: null } })),
        );
    }
  }, [watches]);

  const usagePct = Math.min(100, Math.round((watches.length / cap) * 100));

  return (
    <section style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 8 }}>
        <div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: "clamp(26px,4vw,36px)", letterSpacing: "-.02em", color: T.ink, margin: "0 0 8px" }}>
            Watchlist
          </h1>
          <p style={{ fontSize: 14.5, color: T.muted, margin: 0, maxWidth: 460, lineHeight: 1.5 }}>
            We re-check these names on a schedule and email you the moment one frees up. No account —
            just your address.
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.faint }}>
            {watches.length} of {cap} watched
          </div>
          <div style={{ width: 120, height: 6, borderRadius: 99, background: T.subtle, overflow: "hidden", marginTop: 5 }}>
            <div style={{ height: "100%", width: `${usagePct}%`, background: T.brand, borderRadius: 99, transition: "width .4s ease" }} />
          </div>
        </div>
      </div>

      {/* Honesty: this list is what THIS browser remembers. The manage link is
          also emailed, so a cleared store doesn't lose the watch itself. */}
      <div style={{ fontSize: 12, color: T.faint, fontFamily: FONT_MONO, marginTop: 4, marginBottom: 4 }}>
        This list lives in your browser — manage links are emailed too, so clearing it won&apos;t lose a
        watch.
      </div>

      {watches.length === 0 ? (
        <div style={{ marginTop: 22, border: `1.5px dashed ${T.line}`, borderRadius: radius, padding: "40px 26px", textAlign: "center", background: T.subtle }}>
          <div style={{ fontSize: 26, marginBottom: 10, color: T.faint }}>◔</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 18, color: T.ink, marginBottom: 6 }}>
            Nothing on watch yet
          </div>
          <p style={{ fontSize: 14, color: T.muted, margin: "0 auto 18px", maxWidth: 380, lineHeight: 1.55 }}>
            Found a name that&apos;s perfect but taken? Watch it from a Check result and we&apos;ll ping
            you if it ever frees up.
          </p>
          <button
            onClick={onCheck}
            style={{ fontSize: 13.5, fontWeight: 600, color: "#fff", background: T.brand, border: "none", borderRadius: 10, padding: "10px 20px", cursor: "pointer" }}
          >
            Check a name →
          </button>
        </div>
      ) : (
        <>
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            {watches.map((wch) => {
              const rm = remotes[wch.token] ?? { loading: true, error: false, data: null };
              const row = toWatchRow(wch, rm.data, { loading: rm.loading, error: rm.error });
              return (
                <div key={wch.token} style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "14px 16px", border: `1px solid ${T.line}`, borderRadius: radius, background: T.card }}>
                  <div style={{ minWidth: 130, flex: 1 }}>
                    <div style={{ fontFamily: FONT_MONO, fontWeight: 500, fontSize: 16, color: T.ink }}>{row.domain}</div>
                    <div style={{ fontSize: 11.5, color: T.faint, fontFamily: FONT_MONO, marginTop: 3 }}>
                      last checked {row.lastChecked}
                    </div>
                  </div>
                  <div style={{ minWidth: 110 }}>
                    <div style={{ fontSize: 11, color: T.faint, textTransform: "uppercase", letterSpacing: ".04em", fontFamily: FONT_MONO }}>Expiry</div>
                    <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>{row.expiry}</div>
                  </div>
                  <StatusPill status={row.uiStatus} label={row.statusLabel} />
                  <a
                    href={`/watch/${wch.token}`}
                    style={{ fontSize: 12.5, color: T.muted, background: T.subtle, border: `1px solid ${T.line}`, borderRadius: 8, padding: "6px 11px", textDecoration: "none" }}
                  >
                    Manage
                  </a>
                  <button
                    onClick={() => removeByToken(wch.token)}
                    style={{ fontSize: 12.5, color: T.faint, background: T.subtle, border: `1px solid ${T.line}`, borderRadius: 8, padding: "6px 11px", cursor: "pointer" }}
                  >
                    Stop watching
                  </button>
                </div>
              );
            })}
          </div>

          {atCap && (
            <div style={{ marginTop: 14, border: `1px solid ${T.brandBorder}`, borderRadius: radius, overflow: "hidden", background: T.brandSoft }}>
              <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <span style={{ display: "inline-grid", placeItems: "center", width: 38, height: 38, borderRadius: 11, fontSize: 18, background: T.brand, color: "#fff" }}>↑</span>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 16, color: T.ink }}>
                    You&apos;re watching all {cap} free slots.
                  </div>
                  <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>
                    Upgrade to Pro to monitor unlimited names, get instant alerts, and re-check more often.
                  </div>
                </div>
                {/* Forward monetization slot — no billing wired yet. */}
                <button
                  title="Billing isn't wired yet"
                  style={{ fontSize: 13.5, fontWeight: 600, color: "#fff", background: T.brand, border: "none", borderRadius: 10, padding: "10px 18px", cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  Upgrade to Pro
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
