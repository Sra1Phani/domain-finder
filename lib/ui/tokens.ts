// Base design tokens (non-status), ported from the design's tokens(). Kept as a
// single module so the palette has one point of change. The brand hue drives the
// brand ramp; change HUE (or the --cl-brand-hue CSS var) to re-skin.

export const HUE = 275; // brand hue
export const RADIUS = 16;
export const RADIUS_S = Math.max(10, RADIUS - 4);

export const T = {
  hue: HUE,
  brand: `oklch(0.55 0.17 ${HUE})`,
  brandSoft: `oklch(0.95 0.035 ${HUE})`,
  brandBorder: `oklch(0.86 0.07 ${HUE})`,
  ink: "oklch(0.27 0.014 265)",
  muted: "oklch(0.52 0.014 265)",
  faint: "oklch(0.66 0.012 265)",
  line: "oklch(0.9 0.006 265)",
  subtle: "oklch(0.975 0.004 265)",
  card: "#ffffff",
  canvas: "oklch(0.986 0.004 265)",
} as const;

// Font family stacks — the actual faces are loaded via next/font in layout.tsx,
// which sets these CSS variables.
export const FONT_DISPLAY = "var(--font-display), sans-serif";
export const FONT_SANS = "var(--font-sans), sans-serif";
export const FONT_MONO = "var(--font-mono), monospace";

export const radius = `${RADIUS}px`;
export const radiusS = `${RADIUS_S}px`;

// Swappable wordmark — neutral placeholder, one point of change. Do NOT bake a
// real brand in here; the design's "Clearance" was mock and is intentionally
// not used.
export const WORDMARK = "synthname";

// TLD options offered in the Check/Generate selectors (with leading dot). Both
// backends accept the `tlds` param — /api/search wants the dot, streamBrand
// strips it — so passing the dotted form works for both. A TLD with no public
// RDAP server just resolves to "unknown" (rendered honestly, never green), so
// offering a broad palette is safe.
export const TLD_OPTIONS = [
  ".com", ".io", ".ai", ".co", ".app", ".dev", ".net", ".org",
  ".xyz", ".me", ".tech", ".cloud", ".online", ".site", ".store", ".space",
];
export const DEFAULT_TLDS_UI = [".com", ".io", ".dev", ".app", ".ai"];
