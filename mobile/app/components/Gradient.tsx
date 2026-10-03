import { StyleSheet, View, type ViewStyle } from "react-native"
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg"

import { useAppTheme } from "@/theme/context"

export type GradientProps = {
  /** The two ends; defaults to the brand teal running into its lighter self. */
  from?: string
  to?: string
  /** 0 is left→right (the reference's buttons); 90 is top→bottom. */
  angle?: 0 | 45 | 90
  /** Corner radius, matched to the box the gradient fills. */
  radius?: number
  style?: ViewStyle
}

/**
 * A gradient fill behind whatever it sits under. Drawn with the SVG library the app already ships, so the
 * teal sweep on a button or a hero card costs no extra native module.
 */
export function Gradient({ from, to, angle = 0, radius = 0, style }: GradientProps) {
  const { theme } = useAppTheme()
  const start = from ?? theme.colors.palette.brandGradientStart
  const end = to ?? theme.colors.palette.brandGradientEnd
  const x2 = angle === 90 ? "0" : "1"
  const y2 = angle === 0 ? "0" : "1"
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius }, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="g" x1="0" y1="0" x2={x2} y2={y2}>
            <Stop offset="0" stopColor={start} />
            <Stop offset="1" stopColor={end} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" rx={radius} ry={radius} fill="url(#g)" />
      </Svg>
    </View>
  )
}
