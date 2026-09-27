/**
 * Light theme. Values copied from the web app's `globals.css` so both apps look like one product.
 * Every tone (brand, teal, violet, ok, warn, danger, info) has a solid colour and a soft background.
 */
const palette = {
  bg: "#f7f8fa",
  surface: "#ffffff",
  surface2: "#f9fafb",
  raised: "#ffffff",
  ink: "#171c26",
  inkSoft: "#596273",
  inkFaint: "#8a93a5",
  line: "#e7e9ee",
  lineStrong: "#d3d7de",
  onSolid: "#ffffff",

  brand: "#0f6cbd",
  brandStrong: "#0b58a0",
  brandSoft: "#e6f0fb",
  brandInk: "#0b58a0",
  teal: "#0e8a7d",
  tealSoft: "#e0f4f1",
  violet: "#6b4fd8",
  violetSoft: "#eeeafc",
  ok: "#107c41",
  okSoft: "#e2f3e9",
  warn: "#b25e00",
  warnSoft: "#fdf0dd",
  danger: "#c4314b",
  dangerSoft: "#fbe8ec",
  info: "#0f6cbd",
  infoSoft: "#e6f0fb",
  neutral: "#596273",
  neutralSoft: "#eef0f3",
  chart: "#0f6cbd",

  // Aliases the Ignite Toggle components expect; mapped onto the Padav palette.
  neutral100: "#ffffff",
  neutral200: "#f9fafb",
  neutral300: "#e7e9ee",
  neutral400: "#d3d7de",
  neutral500: "#8a93a5",
  neutral600: "#596273",
  neutral700: "#3b4355",
  neutral800: "#171c26",
  neutral900: "#000000",
  primary500: "#0f6cbd",
  secondary500: "#0f6cbd",
  accent100: "#e6f0fb",
  accent500: "#0f6cbd",
  angry100: "#fbe8ec",
  angry500: "#c4314b",

  overlay20: "rgba(16, 24, 40, 0.2)",
  overlay50: "rgba(16, 24, 40, 0.5)",
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
  /** Solid ink button (the web's primary button). */
  primaryButton: palette.ink,
} as const
