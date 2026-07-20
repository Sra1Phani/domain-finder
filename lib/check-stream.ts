// Pure stream logic for the Check flow: NDJSON bytes → lines → CheckEvents →
// per-name state. No network, no React — so it's unit-testable end to end. The
// component (Check.tsx) only supplies the fetch/reader and renders the state.
//
// The client consumes CheckEvents (already mapped server-side by /api/check), so
// "unknown"/"invalid" arrive as-is and are never re-derived toward available.

import type { CheckAcquire, CheckEvent, CheckSurfaceEvent } from "./check-events";
import type { UiStatus } from "./ui/status";

const REGISTRY_LABEL: Record<string, string> = { github: "GitHub", npm: "npm", pypi: "PyPI" };

export type SurfaceState = {
  surface: string;
  type: "domain" | "registry";
  label: string;
  status: UiStatus;
  meta?: string;
  url?: string | null;
  tld?: string | null;
  expiry?: string | null;
  /** brand-operated/restricted TLD; null until known (domains only) */
  restricted?: boolean | null;
  /** acquirability forward slot; null until wired (premium/for-sale/price) */
  acquire?: CheckAcquire | null;
};

export type CheckNameState = {
  name: string;
  surfaces: SurfaceState[];
  done: boolean;
  summary?: { allClear: boolean; takenOn: string[] };
  error?: string;
};

export function initialNameState(name: string): CheckNameState {
  return { name, surfaces: [], done: false };
}

function fmtDate(iso?: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/** Human meta line from REAL fields only — no fabricated counts/versions/followers. */
export function metaForSurface(ev: CheckSurfaceEvent): string {
  const dom = ev.type === "domain";
  switch (ev.status) {
    case "available":
      return dom ? "Available to register" : "Free to claim";
    case "parked": {
      const e = fmtDate(ev.expiry);
      return e ? `Parked · expires ${e}` : "Parked · may be for sale";
    }
    case "taken": {
      const e = fmtDate(ev.expiry);
      return dom ? (e ? `Registered · expires ${e}` : "Registered") : "Taken";
    }
    case "unknown":
      return dom ? "Registrar didn’t respond" : "Registry didn’t respond";
    case "invalid":
      return dom ? "Not a valid domain label" : "Not valid on this registry";
    default:
      return "";
  }
}

function classify(id: string): { type: "domain" | "registry"; label: string } {
  return id.includes(".")
    ? { type: "domain", label: id }
    : { type: "registry", label: REGISTRY_LABEL[id] ?? id };
}

/** Fold one CheckEvent into a name's state. Pure. */
export function applyCheckEvent(state: CheckNameState, ev: CheckEvent): CheckNameState {
  switch (ev.kind) {
    case "init":
      return {
        ...state,
        surfaces: ev.surfaces.map((id) => ({ surface: id, ...classify(id), status: "checking" as UiStatus })),
        done: false,
        summary: undefined,
        error: undefined,
      };
    case "result":
      return {
        ...state,
        surfaces: state.surfaces.map((s) =>
          s.surface === ev.surface
            ? {
                surface: ev.surface,
                type: ev.type as "domain" | "registry",
                label: ev.label,
                status: ev.status as UiStatus,
                meta: metaForSurface(ev),
                url: ev.url ?? null,
                tld: ev.tld ?? null,
                expiry: ev.expiry ?? null,
                restricted: ev.restricted ?? null,
                acquire: ev.acquire ?? null,
              }
            : s,
        ),
      };
    case "summary":
      return { ...state, done: true, summary: { allClear: ev.allClear, takenOn: ev.takenOn } };
    case "error":
      return { ...state, done: true, error: ev.message };
    default:
      return state;
  }
}

/**
 * Turn a text chunk (+ carry from the previous chunk) into complete CheckEvents,
 * returning the leftover partial line as the new carry. Malformed lines are
 * skipped, never thrown. Line-buffered so it's correct across chunk boundaries.
 */
export function consumeNdjson(
  text: string,
  carry: string,
): { events: CheckEvent[]; carry: string } {
  const buf = carry + text;
  const parts = buf.split("\n");
  const rest = parts.pop() ?? "";
  const events: CheckEvent[] = [];
  for (const line of parts) {
    const t = line.trim();
    if (!t) continue;
    try {
      events.push(JSON.parse(t) as CheckEvent);
    } catch {
      // ignore a malformed line rather than crash the reveal
    }
  }
  return { events, carry: rest };
}

/** The card verdict: tone + label + progress. Uses the server summary when present. */
export function verdictOf(state: CheckNameState): {
  tone: UiStatus;
  label: string;
  pct: number;
  done: boolean;
  allClear: boolean;
} {
  const surfaces = state.surfaces;
  const total = surfaces.length;
  const resolved = surfaces.filter((s) => s.status !== "checking").length;
  const clear = surfaces.filter((s) => s.status === "available").length;
  const done = state.done || (total > 0 && resolved === total);
  // allClear is server-authoritative (respects unknown/invalid); the provisional
  // requires every surface to be confirmed available, so unknown can't sneak in.
  const allClear = state.summary ? state.summary.allClear : done && total > 0 && clear === total;

  let tone: UiStatus;
  let label: string;
  if (state.error) {
    tone = "unknown";
    label = "Check failed";
  } else if (!done) {
    tone = "checking";
    label = `Checking ${resolved}/${total}…`;
  } else if (allClear) {
    tone = "available";
    label = `All clear · ${clear}/${total}`;
  } else if (clear >= Math.ceil(total * 0.55)) {
    tone = "parked";
    label = `${clear} of ${total} clear`;
  } else {
    tone = "taken";
    label = `${clear} of ${total} clear`;
  }
  return { tone, label, pct: total ? Math.round((clear / total) * 100) : 0, done, allClear };
}
