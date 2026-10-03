import { StyleSheet, View, type ViewStyle } from "react-native"
import Svg, { Defs, LinearGradient, Polygon, Stop } from "react-native-svg"

import { useAppTheme } from "@/theme/context"

export type WedgeProps = {
  /** Total height of the band; the slanted bottom edge runs from `height` on the left up to `height - drop`. */
  height: number
  drop?: number
  style?: ViewStyle
}

/**
 * The sign-in screen's header: a band of deep navy running into the brand teal, its bottom edge cut on a
 * diagonal so the white page below seems to slide out from under it. Pure vector, no image.
 */
export function Wedge({ height, drop = 96, style }: WedgeProps) {
  const { theme } = useAppTheme()
  const w = 1000
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { height }, style]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="wedge" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={theme.colors.palette.navy} />
            <Stop offset="0.55" stopColor={theme.colors.palette.brandStrong} />
            <Stop offset="1" stopColor={theme.colors.palette.brand} />
          </LinearGradient>
        </Defs>
        <Polygon points={`0,0 ${w},0 ${w},${height - drop} 0,${height}`} fill="url(#wedge)" />
      </Svg>
    </View>
  )
}
