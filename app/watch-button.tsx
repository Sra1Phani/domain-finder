"use client";

import { useState } from "react";

const EMAIL_KEY = "domain-finder:email";

type State =
  | { kind: "idle" }
  | { kind: "prompting" }
  | { kind: "saving" }
  | { kind: "done"; manageUrl: string }
  | { kind: "error"; message: string; label: string };

/**
 * A rejection needs to read as a *reason*, not a generic failure — "Limit
 * reached" and "Can't monitor" mean completely different things to a user, and
 * only one of them is worth retrying. The full sentence stays in the tooltip.
 */
const ERROR_LABEL: Record<string, string> = {
  limit_reached: "Limit reached",
  unobservable_tld: "Can't monitor",
  already_watching: "Already watching",
  invalid_email: "Bad email",
  invalid_domain: "Bad domain",
};

/**
 * Watch a single domain. Email is remembered locally so watching a second
 * domain is one click — the server still treats each watch independently, the
 * email is just prefilled.
 */
export function WatchButton({ domain }: { domain: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [email, setEmail] = useState("");

  function begin() {
    const saved = typeof window === "undefined" ? "" : localStorage.getItem(EMAIL_KEY);
    if (saved) {
      setEmail(saved);
      void submit(saved);
      return;
    }
    setState({ kind: "prompting" });
  }

  async function submit(withEmail: string) {
    setState({ kind: "saving" });
    try {
      const res = await fetch("/api/watch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: withEmail, domain }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({
          kind: "error",
          message: body.error ?? `Failed (${res.status})`,
          label: ERROR_LABEL[body.code] ?? "Can't watch",
        });
        return;
      }
      localStorage.setItem(EMAIL_KEY, withEmail);
      setState({ kind: "done", manageUrl: body.manageUrl });
    } catch {
      setState({ kind: "error", message: "Network error", label: "Retry" });
    }
  }

  if (state.kind === "done") {
    return (
      <a
        href={state.manageUrl}
        className="shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium text-green-600 ring-1 ring-inset ring-green-500/30 dark:text-green-400"
      >
        Watching ✓
      </a>
    );
  }

  if (state.kind === "error") {
    return (
      <button
        type="button"
        onClick={() => setState({ kind: "prompting" })}
        title={state.message}
        className="shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-500 ring-1 ring-inset ring-red-500/30"
      >
        {state.label}
      </button>
    );
  }

  if (state.kind === "prompting") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) void submit(email.trim());
        }}
        className="flex shrink-0 items-center gap-1"
      >
        <input
          autoFocus
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-36 rounded-lg border border-black/15 bg-transparent px-2 py-1 text-xs outline-none focus:border-foreground/40 dark:border-white/15"
        />
        <button
          type="submit"
          className="rounded-lg bg-foreground px-2 py-1 text-xs font-medium text-background"
        >
          Go
        </button>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={begin}
      disabled={state.kind === "saving"}
      className="shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset ring-black/15 transition hover:ring-foreground/40 disabled:opacity-40 dark:ring-white/20"
    >
      {state.kind === "saving" ? "…" : "Watch"}
    </button>
  );
}
