/**
 * Light theme — the app's own look, not the web's.
 *
 * Warm paper rather than cold white, one deep maroon doing the work of a brand colour, and status colours
 * muted enough to sit on a cream page: a desk uses this at arm's length in daylight, and the screen should
 * read as calm rather than as a dashboard. The web app keeps its own palette; only the API is shared.
 */
const palette = {
  bg: "#f5efe9",
  surface: "#ffffff",
  surface2: "#faf5f0",
  raised: "#ffffff",
  ink: "#241d1a",
  inkSoft: "#7b6e66",
  inkFaint: "#a89c93",
  line: "#eadfd6",
  lineStrong: "#dccec2",
  onSolid: "#fdf8f4",

  brand: "#7a1f2b",
  brandStrong: "#5d141e",
  brandSoft: "#f7e6e7",
  brandInk: "#7a1f2b",
  teal: "#2f7d62",
  tealSoft: "#e3efe9",
  violet: "#6b4fd8",
  violetSoft: "#ece7fb",
  ok: "#2f7d52",
  okSoft: "#e3f0e8",
  warn: "#b07d25",
  warnSoft: "#f8eedc",
  danger: "#a8392a",
  dangerSoft: "#f7e4e0",
  info: "#45628f",
  infoSoft: "#e8edf6",
  neutral: "#7b6e66",
  neutralSoft: "#f0e9e2",
  chart: "#8a5a3b",

  // Aliases the Ignite Toggle components expect; mapped onto the Padav palette.
  neutral100: "#ffffff",
  neutral200: "#faf5f0",
  neutral300: "#eadfd6",
  neutral400: "#dccec2",
  neutral500: "#a89c93",
  neutral600: "#7b6e66",
  neutral700: "#4a3f39",
  neutral800: "#241d1a",
  neutral900: "#000000",
  primary500: "#7a1f2b",
  secondary500: "#7a1f2b",
  accent100: "#f7e6e7",
  accent500: "#7a1f2b",
  angry100: "#f7e4e0",
  angry500: "#a8392a",

  overlay20: "rgba(36, 29, 26, 0.2)",
  overlay50: "rgba(36, 29, 26, 0.5)",
} as const

export const colors = {
  palette,
  transparent: "rgba(0, 0, 0, 0)",
  /** The default text colour. */
  text: palette.ink,
  /** Secondary text. */
  textDim: palette.inkSoft,
  /** Faint labels and placeholders. */
  textFaint: palette.inkFaint,
  /** Screen background. */
  background: palette.bg,
  /** Cards and sheets. */
  surface: palette.surface,
  /** Slightly recessed areas inside a surface (segmented tracks, code). */
  surface2: palette.surface2,
  /** Hairlines. */
  border: palette.line,
  /** Input borders. */
  borderStrong: palette.lineStrong,
  /** Main tint (buttons, active tab). */
  tint: palette.brand,
  tintInactive: palette.inkFaint,
  separator: palette.line,
  error: palette.danger,
  errorBackground: palette.dangerSoft,
  /** Text on a solid primary button. */
  onSolid: palette.onSolid,
  /** Solid button: the app's maroon, where the web uses ink. */
  primaryButton: palette.brand,
} as const
