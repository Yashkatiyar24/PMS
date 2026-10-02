/**
 * Light theme — monochrome, matching the web.
 *
 * Black ink on white, grey for everything that used to be a brand colour. Only the status colours (ok, warn,
 * danger) keep a hue, because "occupied", "due" and "failed" must read at a glance; they use the web's values
 * so both apps say the same thing in the same colour.
 */
const palette = {
  bg: "#f7f7f7",
  surface: "#ffffff",
  surface2: "#fafafa",
  raised: "#ffffff",
  ink: "#171717",
  inkSoft: "#595959",
  inkFaint: "#8f8f8f",
  line: "#e8e8e8",
  lineStrong: "#d4d4d4",
  onSolid: "#ffffff",

  brand: "#171717",
  brandStrong: "#000000",
  brandSoft: "#ececec",
  brandInk: "#171717",
  teal: "#525252",
  tealSoft: "#ededed",
  violet: "#737373",
  violetSoft: "#f1f1f1",
  ok: "#107c41",
  okSoft: "#e2f3e9",
  warn: "#b25e00",
  warnSoft: "#fdf0dd",
  danger: "#c4314b",
  dangerSoft: "#fbe8ec",
  info: "#595959",
  infoSoft: "#ececec",
  neutral: "#595959",
  neutralSoft: "#efefef",
  chart: "#171717",

  // Aliases the Ignite Toggle components expect; mapped onto the Padav palette.
  neutral100: "#ffffff",
  neutral200: "#fafafa",
  neutral300: "#e8e8e8",
  neutral400: "#d4d4d4",
  neutral500: "#8f8f8f",
  neutral600: "#595959",
  neutral700: "#3a3a3a",
  neutral800: "#171717",
  neutral900: "#000000",
  primary500: "#171717",
  secondary500: "#171717",
  accent100: "#ececec",
  accent500: "#171717",
  angry100: "#fbe8ec",
  angry500: "#c4314b",

  overlay20: "rgba(0, 0, 0, 0.2)",
  overlay50: "rgba(0, 0, 0, 0.5)",
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
  /** Solid button: ink, as on the web. */
  primaryButton: palette.brand,
} as const
