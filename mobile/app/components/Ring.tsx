import { View, type ViewStyle } from "react-native"
import Svg, { Circle } from "react-native-svg"

import { useAppTheme } from "@/theme/context"

import { Text } from "./Text"

export type RingProps = {
  pct: number
  size?: number
  label?: string
  /** Overrides for a ring drawn on a coloured card, where the theme's own ink would disappear. */
  color?: string
  track?: string
  textColor?: string
}

/** The occupancy ring: a percentage drawn as an arc. */
export function Ring({ pct, size = 96, label, color, track, textColor }: RingProps) {
  const { theme } = useAppTheme()
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <View
      style={[$wrap, { width: size, height: size }]}
      accessibilityLabel={`${Math.round(clamped)}%`}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={track ?? theme.colors.surface2}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? theme.colors.palette.chart}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - clamped / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={$center}>
        <Text
          text={`${Math.round(clamped)}%`}
          style={{
            fontSize: size * 0.22,
            fontWeight: "800",
            color: textColor ?? theme.colors.text,
          }}
        />
        {!!label && (
          <Text
            text={label}
            size="xxs"
            style={{ color: textColor ?? theme.colors.textDim, opacity: textColor ? 0.85 : 1 }}
          />
        )}
      </View>
    </View>
  )
}

const $wrap: ViewStyle = { alignItems: "center", justifyContent: "center" }
const $center: ViewStyle = { position: "absolute", alignItems: "center" }
