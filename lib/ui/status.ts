// The status -> style mapping, ported verbatim from the design's palette. This
// is the UI-layer false-available guard: every status has its OWN distinct hue,
// and "unknown"/"invalid" must NEVER share the available (green) style. Kept as
// a pure module so it can be unit-tested (see status.test.ts).

// The five real CheckStatus values plus two UI-only states: "checking"
// (in-flight, from the init event) and "soon" (trademark, not yet wired).
export type UiStatus =
  | "available"
  | "taken"
  | "parked"
  | "unknown"
  | "invalid"
  | "soon"
  | "checking";

export type StatusStyle = {
  name: string;
  icon: string;
  /** solid fill (dots, bars) */
  solid: string;
  /** soft background */
  bg: string;
  border: string;
  /** text color on soft bg */
  text: string;
};

// oklch values from the design (docs/Clearance.dc.html statusStyles()). The hue
// separation is deliberate and load-bearing: available=green(150),
// taken=red(25), parked=amber(75-85), unknown=NEUTRAL GREY(265, near-zero
// chroma), invalid=purple(305). Do not collapse unknown toward green.
export const STATUS_STYLES: Record<UiStatus, StatusStyle> = {
  available: {
    name: "Available",
    icon: "✓",
    solid: "oklch(0.62 0.14 150)",
    bg: "oklch(0.965 0.04 150)",
    border: "oklch(0.85 0.08 150)",
    text: "oklch(0.42 0.11 150)",
  },
  taken: {
    name: "Taken",
    icon: "✕",
    solid: "oklch(0.57 0.19 25)",
    bg: "oklch(0.965 0.045 25)",
    border: "oklch(0.86 0.09 25)",
    text: "oklch(0.49 0.17 25)",
  },
  parked: {
    name: "Parked",
    icon: "◐",
    solid: "oklch(0.75 0.13 75)",
    bg: "oklch(0.965 0.06 85)",
    border: "oklch(0.85 0.1 80)",
    text: "oklch(0.52 0.1 65)",
  },
  unknown: {
    name: "Unknown",
    icon: "?",
    solid: "oklch(0.62 0.02 265)",
    bg: "oklch(0.955 0.005 265)",
    border: "oklch(0.87 0.008 265)",
    text: "oklch(0.46 0.015 265)",
  },
  invalid: {
    name: "Invalid",
    icon: "ø",
    solid: "oklch(0.52 0.09 305)",
    bg: "oklch(0.95 0.025 305)",
    border: "oklch(0.84 0.05 305)",
    text: "oklch(0.44 0.07 305)",
  },
  soon: {
    name: "Coming soon",
    icon: "…",
    solid: "oklch(0.72 0.01 265)",
    bg: "oklch(0.975 0.004 265)",
    border: "oklch(0.91 0.006 265)",
    text: "oklch(0.56 0.012 265)",
  },
  checking: {
    name: "Checking",
    icon: "•",
    solid: "oklch(0.72 0.01 265)",
    bg: "oklch(0.98 0.004 265)",
    border: "oklch(0.92 0.006 265)",
    text: "oklch(0.6 0.012 265)",
  },
};

/** Style for a status, falling back to the neutral "checking" style. */
export function statusStyle(status: string): StatusStyle {
  return STATUS_STYLES[status as UiStatus] ?? STATUS_STYLES.checking;
}

/** Statuses that use a dashed (not-a-solid-answer) border in the design. */
export function isDashed(status: string): boolean {
  return status === "unknown" || status === "invalid";
}
