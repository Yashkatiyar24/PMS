import type { Colors } from "./types"

/** The web kit's colour vocabulary: every chip, avatar and banner picks one of these. */
export type Tone = "neutral" | "brand" | "teal" | "violet" | "ok" | "warn" | "danger" | "info"

export const TONES: Tone[] = ["neutral", "brand", "teal", "violet", "ok", "warn", "danger", "info"]

/** Solid and soft colours for a tone in the current theme. */
export function toneColors(colors: Colors, tone: Tone): { solid: string; soft: string } {
  const p = colors.palette
  switch (tone) {
    case "brand":
      return { solid: p.brand, soft: p.brandSoft }
    case "teal":
      return { solid: p.teal, soft: p.tealSoft }
    case "violet":
      return { solid: p.violet, soft: p.violetSoft }
    case "ok":
      return { solid: p.ok, soft: p.okSoft }
    case "warn":
      return { solid: p.warn, soft: p.warnSoft }
    case "danger":
      return { solid: p.danger, soft: p.dangerSoft }
    case "info":
      return { solid: p.info, soft: p.infoSoft }
    default:
      return { solid: p.neutral, soft: p.neutralSoft }
  }
}
