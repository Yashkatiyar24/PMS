/**
 * Light theme — the reference design: one vivid teal on white.
 *
 * White screens and white cards lifted by a soft shadow rather than a border; a single teal for everything
 * interactive (buttons, the active tab, a chosen chip, a selected room), running into a lighter teal on the
 * big call-to-action; navy-grey ink so text sits warmly on the cool palette. Status is a tint plus a word:
 * red for dirty and overdue, teal for inspected, green for ok, amber for due, grey for off sale.
 */
const palette = {
  bg: "#ffffff",
  surface: "#ffffff",
  surface2: "#f3f8f9",
  raised: "#ffffff",
  ink: "#1f2d3d",
  inkSoft: "#6b7a8b",
  inkFaint: "#a3afbb",
  line: "#e6edf0",
  lineStrong: "#d5dfe3",
  onSolid: "#ffffff",

  brand: "#26b9cd",
  brandStrong: "#1a9db0",
  brandSoft: "#e2f6f9",
  brandInk: "#0f7f90",
  /** The call-to-action runs from the brand teal into this lighter one, left to right. */
  brandGradientStart: "#23b4c9",
  brandGradientEnd: "#5ed1e1",
  /** The sign-in wedge: a deep navy that the teal runs out of. */
  navy: "#16365c",
  teal: "#26b9cd",
  tealSoft: "#e2f6f9",
  violet: "#3c5a8a",
  violetSoft: "#e9eff7",
  ok: "#1fb67a",
  okSoft: "#e4f7ef",
  warn: "#e69a12",
  warnSoft: "#fdf2dc",
  danger: "#e0564f",
  dangerSoft: "#fdecec",
  info: "#3193e3",
  infoSoft: "#e7f3fc",
  neutral: "#6b7a8b",
  neutralSoft: "#f0f4f6",
  chart: "#26b9cd",
  /** The card shadow's colour; the opacity is set where it is used. */
  shadow: "#1f2d3d",

  // Aliases the Ignite Toggle components expect; mapped onto the Padav palette.
  neutral100: "#ffffff",
  neutral200: "#f3f8f9",
  neutral300: "#e6edf0",
  neutral400: "#d5dfe3",
  neutral500: "#a3afbb",
  neutral600: "#6b7a8b",
  neutral700: "#3f4e5f",
  neutral800: "#1f2d3d",
  neutral900: "#102030",
  primary500: "#26b9cd",
  secondary500: "#3c5a8a",
  accent100: "#e2f6f9",
  accent500: "#26b9cd",
  angry100: "#fdecec",
  angry500: "#e0564f",

  /** White at three strengths, for text and glass on the teal gradient and the navy wedge. */
  onSolidSoft: "rgba(255, 255, 255, 0.72)",
  onSolidFaint: "rgba(255, 255, 255, 0.3)",
  onSolidGlass: "rgba(255, 255, 255, 0.16)",
  overlay20: "rgba(16, 32, 48, 0.2)",
  overlay50: "rgba(16, 32, 48, 0.5)",
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
  /** Input underlines. */
  borderStrong: palette.lineStrong,
  /** Main tint (buttons, active tab). */
  tint: palette.brand,
  tintInactive: palette.inkFaint,
  separator: palette.line,
  error: palette.danger,
  errorBackground: palette.dangerSoft,
  /** Text on a solid primary button. */
  onSolid: palette.onSolid,
  /** Solid button: the brand teal, as in the reference design. */
  primaryButton: palette.brand,
} as const
