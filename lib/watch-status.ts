// Pure mapping: the GET /api/watch/[token] response → a watchlist row model.
//
// The endpoint is token-scoped (the unguessable token is the credential) and
// returns ONLY that one watch's status — never siblings, never the email. This
// module turns that response, or a loading/error placeholder, into the row the
// Watchlist renders. No fabrication: an unresolved or errored row is shown as
// "unknown", never coerced toward available.

import type { UiStatus } from "./ui/status";
import type { LocalWatch } from "./watch-store";

/** The slim, token-scoped status payload from GET /api/watch/[token]. */
export type WatchStatusResponse = {
  domain: string;
  status: string; // raw availability status
  state: "watching" | "fired" | "paused";
  expiresAt: string | null;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
};

export type WatchRow = {
  domain: string;
  token: string;
  uiStatus: UiStatus;
  statusLabel: string;
  /** human expiry ("—" when none/unknown) */
  expiry: string;
  /** human "last checked" ("—" when unknown) */
  lastChecked: string;
  loading: boolean;
  error: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  available: "Available",
  active: "Taken",
  parked: "Parked",
  expiring: "In redemption",
  deleting: "Dropping",
  reserved: "Reserved",
  unknown: "Unknown",
};

/** Availability status → the UI's coarse status. Never invents "available". */
export function availabilityToUi(status: string): UiStatus {
  switch (status) {
    case "available":
      return "available";
    case "parked":
      return "parked";
    case "active":
    case "reserved":
    case "expiring":
    case "deleting":
      return "taken";
    default:
      // unknown, or any status we don't recognize — stay neutral, never green.
      return "unknown";
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "—" : new Date(t).toISOString().slice(0, 10);
}

/**
 * Build a row from the local entry plus the (possibly absent) server status.
 * `remote === null` with `loading` true → an in-flight row; with `error` true →
 * a row whose status couldn't be read. Both render as neutral "unknown".
 */
export function toWatchRow(
  local: LocalWatch,
  remote: WatchStatusResponse | null,
  opts: { loading?: boolean; error?: boolean } = {},
): WatchRow {
  if (!remote) {
    return {
      domain: local.domain,
      token: local.token,
      uiStatus: "unknown",
      statusLabel: opts.error ? "Status unavailable" : opts.loading ? "Checking…" : "Unknown",
      expiry: "—",
      lastChecked: "—",
      loading: !!opts.loading,
      error: !!opts.error,
    };
  }
  return {
    domain: remote.domain,
    token: local.token,
    uiStatus: availabilityToUi(remote.status),
    statusLabel: STATUS_LABEL[remote.status] ?? remote.status,
    expiry: fmtDate(remote.expiresAt),
    lastChecked: fmtDate(remote.lastCheckedAt),
    loading: false,
    error: false,
  };
}
