"use client";

import { useState } from "react";
import type { RankedSuggestion, SearchResponse } from "@domain-finder/core";
import { backorderUrl, buyUrl } from "@/lib/links";
import { WatchButton } from "./watch-button";

const TLD_CHOICES = [".com", ".io", ".ai", ".co", ".app", ".dev", ".xyz", ".me"];
const DEFAULT_SELECTED = [".com", ".io", ".ai", ".co", ".app"];

const STATUS_STYLE: Record<
  RankedSuggestion["availability"]["status"],
  { label: string; cls: string }
> = {
  available: {
    label: "Available",
    cls: "bg-green-500/15 text-green-600 dark:text-green-400 ring-green-500/30",
  },
  deleting: {
    label: "Dropping",
    cls: "bg-orange-500/15 text-orange-600 dark:text-orange-400 ring-orange-500/30",
  },
  expiring: {
    label: "Expiring",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-amber-500/30",
  },
  parked: {
    label: "Parked",
    cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-blue-500/30",
  },
  active: {
    label: "Taken",
    cls: "bg-red-500/10 text-red-500 dark:text-red-400 ring-red-500/25",
  },
  reserved: {
    label: "Reserved",
    cls: "bg-red-500/10 text-red-500 dark:text-red-400 ring-red-500/25",
  },
  unknown: {
    label: "Unknown",
    cls: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 ring-yellow-500/30",
  },
};

function StatusBadge({ status }: { status: RankedSuggestion["availability"]["status"] }) {
  const { label, cls } = STATUS_STYLE[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {label}
    </span>
  );
}

function daysUntil(iso: string): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / 86_400_000);
}

/** The timing line that makes a "dropping" domain actionable. */
function DropNote({ a }: { a: RankedSuggestion["availability"] }) {
  if (a.estimatedDropAt) {
    const d = daysUntil(a.estimatedDropAt);
    if (d !== null) {
      return (
        <span className="text-orange-600 dark:text-orange-400">
          drops in ~{Math.max(0, d)}d (est.)
        </span>
      );
    }
  }
  if (a.status === "expiring") {
    return <span className="text-amber-700 dark:text-amber-400">in redemption</span>;
  }
  if (a.expiresAt) {
    const d = daysUntil(a.expiresAt);
    if (d !== null && d < 90) {
      return <span className="opacity-70">expires in {d}d</span>;
    }
  }
  return null;
}

const SOURCE_LABEL = { ai: "AI", rule: "combo", hack: "hack" } as const;

/**
 * Watching only makes sense for a domain whose status can still change in a way
 * you'd act on. `available` needs no watch (just buy it), and `reserved` will
 * never become registrable. `unknown` is excluded because we can't observe it —
 * the API would refuse the watch anyway, so don't offer it.
 */
const WATCHABLE: ReadonlySet<RankedSuggestion["availability"]["status"]> = new Set([
  "active",
  "parked",
  "expiring",
  "deleting",
]);

function ResultCard({ r }: { r: RankedSuggestion }) {
  const { bucket, status } = r.availability;
  const registrable = bucket === "registrable";
  const dropping = bucket === "dropping";

  // Dropping domains need a backorder, not a registration.
  const cta = dropping
    ? { href: backorderUrl(r.domain), label: "Backorder" }
    : { href: buyUrl(r.domain), label: registrable ? "Buy" : "Check" };

  const drop = <DropNote a={r.availability} />;

  return (
    <li className="flex items-center gap-4 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] px-4 py-3">
      <div className="flex w-10 shrink-0 flex-col items-center">
        <span className="text-lg font-semibold tabular-nums">{r.score}</span>
        <span className="text-[10px] uppercase tracking-wide opacity-50">score</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-mono text-base font-medium">{r.domain}</span>
          <StatusBadge status={r.availability.status} />
          <span className="rounded bg-black/5 dark:bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide opacity-70">
            {SOURCE_LABEL[r.source]}
          </span>
          {drop && <span className="text-xs font-medium">{drop}</span>}
        </div>
        <p className="mt-1 truncate text-xs opacity-60">
          {r.rationale ? `${r.rationale} · ` : ""}
          {r.scoreReasons.join(" · ")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {WATCHABLE.has(status) && <WatchButton domain={r.domain} />}
        <a
          href={cta.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            registrable || dropping
              ? "bg-foreground text-background hover:opacity-90"
              : "border border-black/15 dark:border-white/15 opacity-70 hover:opacity-100"
          }`}
        >
          {cta.label}
        </a>
      </div>
    </li>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [tlds, setTlds] = useState<string[]>(DEFAULT_SELECTED);
  const [useAi, setUseAi] = useState(true);
  const [useHacks, setUseHacks] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SearchResponse | null>(null);

  function toggleTld(t: string) {
    setTlds((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, tlds, useAi, useHacks }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12 sm:py-20">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Domain Finder</h1>
        <p className="mt-2 text-sm opacity-60">
          Describe your idea. Get brandable, available domain names — ranked.
        </p>
      </header>

      <form onSubmit={runSearch} className="space-y-4">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. app that recommends good domain names"
            className="w-full rounded-xl border border-black/15 dark:border-white/15 bg-transparent px-4 py-3 text-base outline-none focus:border-foreground/40"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="shrink-0 rounded-xl bg-foreground px-5 py-3 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-40"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {TLD_CHOICES.map((t) => {
            const on = tlds.includes(t);
            return (
              <button
                type="button"
                key={t}
                onClick={() => toggleTld(t)}
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition ${
                  on
                    ? "bg-foreground text-background ring-transparent"
                    : "ring-black/15 dark:ring-white/20 opacity-70 hover:opacity-100"
                }`}
              >
                {t}
              </button>
            );
          })}
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs opacity-70">
            <input
              type="checkbox"
              checked={useAi}
              onChange={(e) => setUseAi(e.target.checked)}
              className="accent-current"
            />
            AI brainstorm
          </label>
          <label
            className="flex cursor-pointer items-center gap-2 text-xs opacity-70"
            title="Domain hacks use the TLD as part of the word (bit.ly), so they ignore the TLD filter above."
          >
            <input
              type="checkbox"
              checked={useHacks}
              onChange={(e) => setUseHacks(e.target.checked)}
              className="accent-current"
            />
            Domain hacks
          </label>
        </div>
      </form>

      {error && (
        <p className="mt-6 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>
      )}

      {data && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between text-xs opacity-50">
            <span>
              {data.results.filter((r) => r.availability.bucket === "registrable").length} available
              {(() => {
                const d = data.results.filter((r) => r.availability.bucket === "dropping").length;
                return d > 0 ? `, ${d} dropping` : "";
              })()}{" "}
              of {data.results.length}
            </span>
            <span>
              {data.meta.aiUsed ? "AI + combos" : "combos"} · {data.meta.availabilityProvider} ·{" "}
              {data.meta.tookMs}ms
            </span>
          </div>
          {data.results.length === 0 ? (
            <p className="text-sm opacity-60">No candidates — try a different phrase.</p>
          ) : (
            <ul className="space-y-2">
              {data.results.map((r) => (
                <ResultCard key={r.domain} r={r} />
              ))}
            </ul>
          )}
        </section>
      )}

      {!data && !error && (
        <p className="mt-10 text-center text-sm opacity-40">
          Try “project management tool for designers” or “vegan meal delivery”.
        </p>
      )}
    </main>
  );
}
