"use client";

import { useState } from "react";
import { StatusDot } from "./parts";
import { STATUS_STYLES, type UiStatus } from "@/lib/ui/status";
import { T, FONT_DISPLAY, FONT_MONO, radius, radiusS } from "@/lib/ui/tokens";

const LEGEND: UiStatus[] = ["available", "taken", "parked", "unknown", "invalid"];

export function Home({
  onGenerate,
  onCheck,
  onWatch,
}: {
  onGenerate: () => void;
  onCheck: (name: string) => void;
  onWatch: () => void;
}) {
  const [name, setName] = useState("");

  const doorBase = {
    background: T.card,
    borderRadius: radius,
    padding: "22px 22px",
    display: "flex",
    flexDirection: "column" as const,
  };
  const iconBase = {
    display: "inline-grid",
    placeItems: "center",
    width: 38,
    height: 38,
    borderRadius: 11,
    fontSize: 18,
    flexShrink: 0,
  };

  return (
    <section style={{ maxWidth: 960, margin: "0 auto" }}>
      <div style={{ textAlign: "center", maxWidth: 640, margin: "10px auto 34px" }}>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 12,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            color: T.brand,
            marginBottom: 14,
          }}
        >
          Name it. Then prove it&apos;s yours.
        </div>
        <h1
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: "clamp(32px,5.5vw,52px)",
            lineHeight: 1.02,
            letterSpacing: "-.025em",
            color: T.ink,
            margin: "0 0 14px",
            textWrap: "balance",
          }}
        >
          Is your name free <span style={{ color: T.brand }}>everywhere</span> that matters?
        </h1>
        <p
          style={{
            fontSize: 17,
            lineHeight: 1.55,
            color: T.muted,
            margin: "0 auto",
            maxWidth: 500,
            textWrap: "pretty",
          }}
        >
          Check a candidate across domains, GitHub, npm &amp; PyPI in one live pass — or describe
          your idea and let the names come to you.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 18 }}>
        {/* generate door */}
        <div
          style={{
            ...doorBase,
            border: `1.5px solid ${T.brandBorder}`,
            boxShadow: `0 8px 30px color-mix(in oklch, ${T.brand} 12%, transparent)`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ ...iconBase, background: T.brand, color: "#fff" }}>✦</span>
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 11,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: T.brand,
              }}
            >
              I need a name
            </div>
          </div>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 24, letterSpacing: "-.01em", color: T.ink, margin: "0 0 8px" }}>
            Generate
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: T.muted, margin: "0 0 18px", textWrap: "pretty" }}>
            Describe your idea. Watch brandable candidates cascade in, each with a live availability
            signal.
          </p>
          <button
            onClick={onGenerate}
            style={{
              fontFamily: "inherit",
              fontSize: 14,
              fontWeight: 600,
              color: "#fff",
              background: T.brand,
              border: "none",
              borderRadius: radiusS,
              padding: 12,
              cursor: "pointer",
              marginTop: "auto",
            }}
          >
            Start generating →
          </button>
        </div>

        {/* check door */}
        <div style={{ ...doorBase, border: `1.5px solid ${T.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ ...iconBase, background: T.subtle, color: T.ink, border: `1px solid ${T.line}` }}>◎</span>
            <div style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: T.ink }}>
              I have a name
            </div>
          </div>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 24, letterSpacing: "-.01em", color: T.ink, margin: "0 0 8px" }}>
            Check
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: T.muted, margin: "0 0 16px", textWrap: "pretty" }}>
            Type it once. Every surface lights up green or red in real time.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) onCheck(name.trim());
            }}
            style={{ display: "flex", gap: 8, marginTop: "auto" }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: T.card,
                border: `1.5px solid ${T.line}`,
                borderRadius: radiusS,
                padding: "0 12px",
              }}
            >
              <span style={{ fontFamily: FONT_MONO, color: T.faint, fontSize: 14 }}>›</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="namescope"
                autoComplete="off"
                spellCheck={false}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontFamily: FONT_MONO,
                  fontSize: 15,
                  color: T.ink,
                  padding: "12px 0",
                  minWidth: 0,
                }}
              />
            </div>
            <button
              type="submit"
              style={{
                fontFamily: "inherit",
                fontSize: 14,
                fontWeight: 600,
                color: "#fff",
                background: T.ink,
                border: "none",
                borderRadius: radiusS,
                padding: "0 16px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Check →
            </button>
          </form>
        </div>
      </div>

      <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13.5, color: T.muted }}>
        <span>Tracking a name that&apos;s already taken?</span>
        <button
          onClick={onWatch}
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: T.brand,
            background: "none",
            border: "none",
            cursor: "pointer",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          Open your watchlist →
        </button>
      </div>

      <div
        style={{
          marginTop: 38,
          borderTop: `1px solid ${T.line}`,
          paddingTop: 18,
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 11, color: T.faint, fontFamily: FONT_MONO, textTransform: "uppercase", letterSpacing: ".06em" }}>
          Every status, always distinct
        </span>
        {LEGEND.map((k) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: T.muted }}>
            <StatusDot status={k} size={17} />
            {STATUS_STYLES[k].name}
          </span>
        ))}
      </div>
    </section>
  );
}
