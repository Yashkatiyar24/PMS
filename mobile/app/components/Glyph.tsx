import { Platform } from "react-native"
import Svg from "react-native-svg"

import { useAppTheme } from "@/theme/context"

import { shapesA } from "./glyphShapesA"
import { shapesB } from "./glyphShapesB"
import type { GlyphName, S } from "./glyphTypes"

export type { GlyphName } from "./glyphTypes"

/**
 * The app's icons: a small set of 24-unit line drawings in the reference's thin, rounded style, drawn as SVG
 * paths so they take any colour and size and never fall back to an emoji font. One component, one name.
 */

export type GlyphProps = {
  name: GlyphName
  size?: number
  color?: string
  /** Line weight; the reference draws its icons thin. */
  weight?: number
}

export function Glyph({ name, size = 20, color, weight = 1.75 }: GlyphProps) {
  const { theme } = useAppTheme()
  const stroke = color ?? theme.colors.text
  const common = {
    stroke,
    strokeWidth: weight,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none" as const,
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...HIDDEN}>
      {shapes[name](common)}
    </Svg>
  )
}

const shapes: Record<GlyphName, (s: S) => React.ReactNode> = { ...shapesA, ...shapesB }

/** Decorative for assistive tech: the control around the icon carries the name. The browser wants the ARIA form. */
const HIDDEN =
  Platform.OS === "web"
    ? ({ "aria-hidden": true } as const)
    : ({
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants",
      } as const)
