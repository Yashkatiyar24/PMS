import { View, type ViewStyle } from "react-native"

import { useAppTheme } from "@/theme/context"

import { Text } from "./Text"

export type Bar = { label: string; value: number; hint?: string }

/** A row of vertical bars drawn with views (the forecast chart). Values are 0–100 unless `max` is given. */
export function Bars({
  bars,
  max = 100,
  height = 96,
}: {
  bars: Bar[]
  max?: number
  height?: number
}) {
  const { theme } = useAppTheme()
  return (
    <View style={[$row, { height: height + 20 }]} accessibilityRole="image">
      {bars.map((b, i) => (
        <View key={i} style={$col}>
          <View style={[$track, { height, backgroundColor: theme.colors.surface2 }]}>
            <View
              style={[
                $fill,
                {
                  height: Math.max(2, (Math.min(b.value, max) / max) * height),
                  backgroundColor: theme.colors.palette.chart,
                },
              ]}
            />
          </View>
          <Text
            text={b.label}
            size="xxs"
            style={{ color: theme.colors.textFaint }}
            numberOfLines={1}
          />
        </View>
      ))}
    </View>
  )
}

/** Horizontal bars with labels and values, for category breakdowns. */
export function HBars({
  rows,
  format,
}: {
  rows: Array<{ label: string; value: number }>
  format: (v: number) => string
}) {
  const { theme } = useAppTheme()
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r) => (
        <View key={r.label} style={{ gap: 2 }}>
          <View style={$hLabel}>
            <Text
              text={r.label}
              size="xs"
              style={{ color: theme.colors.textDim, flex: 1 }}
              numberOfLines={1}
            />
            <Text
              text={format(r.value)}
              size="xs"
              weight="bold"
              style={{ color: theme.colors.text }}
            />
          </View>
          <View style={[$hTrack, { backgroundColor: theme.colors.surface2 }]}>
            <View
              style={[
                $hFill,
                { width: `${(r.value / max) * 100}%`, backgroundColor: theme.colors.palette.chart },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  )
}

const $row: ViewStyle = { flexDirection: "row", alignItems: "flex-end", gap: 4 }
const $col: ViewStyle = { flex: 1, alignItems: "center", gap: 2 }
const $track: ViewStyle = {
  width: "100%",
  borderRadius: 4,
  justifyContent: "flex-end",
  overflow: "hidden",
}
const $fill: ViewStyle = { width: "100%", borderRadius: 4 }
const $hLabel: ViewStyle = { flexDirection: "row", gap: 8 }
const $hTrack: ViewStyle = { height: 8, borderRadius: 4, overflow: "hidden" }
const $hFill: ViewStyle = { height: 8, borderRadius: 4 }
