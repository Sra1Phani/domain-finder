"use client";

import { useRef } from "react";
import { useWatchlist } from "./watchlist-context";
import { StatusPill } from "./parts";
import { T, FONT_DISPLAY, FONT_MONO, radius } from "@/lib/ui/tokens";

// The "Watch this" modal. Three states driven entirely by context: collect an
// email (form) → confirm with the private manage link (done), or the free-cap
// upgrade prompt (limit). No billing — the upgrade CTA is a forward slot.
export function WatchModal() {
  const { modal, cap, closeModal, submitWatch } = useWatchlist();
  const emailRef = useRef<HTMLInputElement>(null);
  if (!modal) return null;

  return (
    <div
      onClick={closeModal}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: `color-mix(in oklch, ${T.ink} 34%, transparent)`,
        backdropFilter: "blur(3px)",
        display: "grid",
        placeItems: "center",
        padding: 22,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          background: T.card,
          border: `1px solid ${T.line}`,
          borderRadius: radius,
          boxShadow: "0 24px 60px rgba(20,18,40,.28)",
          overflow: "hidden",
          animation: "cl-modal .24s cubic-bezier(.2,.7,.3,1) both",
        }}
      >
        {modal.kind === "form" && (
          <div style={{ padding: "24px 22px" }}>
            {/* modal.status is already a UiStatus from the Check surface. */}
            <StatusPill status={modal.status} />
            <h3 style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 22, color: T.ink, margin: "10px 0 8px" }}>
              Watch <span style={{ color: T.brand, fontFamily: FONT_MONO }}>{modal.domain}</span>
            </h3>
            <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.5, margin: "0 0 16px" }}>
              We&apos;ll re-check it on a schedule and email you if it frees up. Enter your address —
              that&apos;s it.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const email = emailRef.current?.value.trim() ?? "";
                if (email) void submitWatch(email, modal.domain);
              }}
            >
              <input
                ref={emailRef}
                type="email"
                required
                placeholder="you@company.com"
                disabled={modal.submitting}
                style={{
                  width: "100%",
                  border: `1.5px solid ${modal.error ? T.brand : T.line}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  fontFamily: "inherit",
                  fontSize: 15,
                  color: T.ink,
                  outline: "none",
                  background: T.subtle,
                }}
              />
              {modal.error && (
                <div style={{ fontSize: 12.5, color: T.brand, marginTop: 8 }}>{modal.error}</div>
              )}
              <div style={{ display: "flex", gap: 9, marginTop: 12 }}>
                <button
                  type="submit"
                  disabled={modal.submitting}
                  style={{
                    flex: 1,
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#fff",
                    background: T.brand,
                    border: "none",
                    borderRadius: 10,
                    padding: 12,
                    cursor: modal.submitting ? "default" : "pointer",
                    opacity: modal.submitting ? 0.7 : 1,
                  }}
                >
                  {modal.submitting ? "Starting…" : "Start watching"}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{ fontSize: 14, color: T.muted, background: T.subtle, border: `1px solid ${T.line}`, borderRadius: 10, padding: "12px 16px", cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            </form>
            <div style={{ fontSize: 11, color: T.faint, textAlign: "center", marginTop: 12 }}>
              Anonymous · no password · unsubscribe anytime
            </div>
          </div>
        )}

        {modal.kind === "done" && (
          <div style={{ padding: "26px 22px", textAlign: "center" }}>
            <div style={{ width: 46, height: 46, borderRadius: 99, background: T.brand, color: "#fff", display: "grid", placeItems: "center", fontSize: 22, margin: "0 auto 14px", animation: "cl-burst .45s ease both" }}>
              ✓
            </div>
            <h3 style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 20, color: T.ink, margin: "0 0 8px" }}>
              You&apos;re watching {modal.domain}
            </h3>
            <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.55, margin: "0 0 14px" }}>
              We&apos;ll email <strong style={{ color: T.ink }}>{modal.email}</strong> the moment its
              status changes. No account — manage anytime with your private link, which we also emailed
              you.
            </p>
            <a
              href={modal.manageUrl}
              style={{ display: "block", fontFamily: FONT_MONO, fontSize: 11.5, color: T.brand, background: T.brandSoft, border: `1px solid ${T.brandBorder}`, borderRadius: 9, padding: "9px 12px", marginBottom: 16, wordBreak: "break-all", textDecoration: "none" }}
            >
              {modal.manageUrl}
            </a>
            <button
              onClick={closeModal}
              style={{ width: "100%", fontSize: 14, fontWeight: 600, color: "#fff", background: T.brand, border: "none", borderRadius: 10, padding: 11, cursor: "pointer" }}
            >
              Done
            </button>
          </div>
        )}

        {modal.kind === "limit" && (
          <div style={{ padding: "24px 22px" }}>
            <span style={{ display: "inline-grid", placeItems: "center", width: 38, height: 38, borderRadius: 11, fontSize: 18, background: T.brand, color: "#fff" }}>
              ↑
            </span>
            <h3 style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 20, color: T.ink, margin: "14px 0 8px" }}>
              Your free watch slots are full
            </h3>
            <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.55, margin: "0 0 18px" }}>
              The free plan tracks up to {cap} names. Upgrade to Pro to watch{" "}
              <strong style={{ color: T.ink, fontFamily: FONT_MONO }}>{modal.domain}</strong> and
              unlimited more — with faster re-checks and instant alerts.
            </p>
            <div style={{ display: "flex", gap: 9 }}>
              {/* Forward monetization slot — no billing wired yet. */}
              <button
                onClick={closeModal}
                title="Billing isn't wired yet"
                style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#fff", background: T.brand, border: "none", borderRadius: 10, padding: 11, cursor: "pointer" }}
              >
                Upgrade to Pro
              </button>
              <button
                onClick={closeModal}
                style={{ fontSize: 14, color: T.muted, background: T.subtle, border: `1px solid ${T.line}`, borderRadius: 10, padding: "11px 16px", cursor: "pointer" }}
              >
                Not now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
