/**
 * Light theme — airy teal on white, after the reference design.
 *
 * White cards on a near-white cool background, one vivid teal for everything interactive (buttons, active
 * tabs, selected chips), and soft status tints: red for dirty/overdue, green for ok, amber for due. Ink is a
 * blue-grey near-black so text sits comfortably on the cool palette.
 */
const palette = {
  bg: "#f5fafb",
  surface: "#ffffff",
  surface2: "#f2f8f9",
  raised: "#ffffff",
  ink: "#1f2d3d",
  inkSoft: "#5f6b7a",
  inkFaint: "#9aa5b1",
  line: "#e8eef0",
  lineStrong: "#d3dde0",
  onSolid: "#ffffff",

  brand: "#1fb6cb",
  brandStrong: "#0e98ac",
  brandSoft: "#e0f6f9",
  brandInk: "#0b7285",
  teal: "#1fb6cb",
  tealSoft: "#e0f6f9",
  violet: "#2c4a77",
  violetSoft: "#e9eff7",
  ok: "#12b886",
  okSoft: "#e6f9f2",
  warn: "#e8930c",
  warnSoft: "#fdf1dc",
  danger: "#f0655d",
  dangerSoft: "#fdeae9",
  info: "#3193e3",
  infoSoft: "#e7f3fc",
  neutral: "#5f6b7a",
  neutralSoft: "#eef2f4",
  chart: "#1fb6cb",

  // Aliases the Ignite Toggle components expect; mapped onto the Padav palette.
  neutral100: "#ffffff",
  neutral200: "#f2f8f9",
  neutral300: "#e8eef0",
  neutral400: "#d3dde0",
  neutral500: "#9aa5b1",
  neutral600: "#5f6b7a",
  neutral700: "#3c4858",
  neutral800: "#1f2d3d",
  neutral900: "#102030",
  primary500: "#1fb6cb",
  secondary500: "#2c4a77",
  accent100: "#e0f6f9",
  accent500: "#1fb6cb",
  angry100: "#fdeae9",
  angry500: "#f0655d",

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
  /** Solid button: the brand teal, as in the reference design. */
  primaryButton: palette.brand,
} as const
