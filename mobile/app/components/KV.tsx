import { View, type TextStyle, type ViewStyle } from "react-native"

import { useAppTheme } from "@/theme/context"
import { toneColors, type Tone } from "@/theme/tones"

import { Text } from "./Text"

export type KVProps = { label: string; value: string; strong?: boolean; tone?: Tone }

/** One label/value row for a summary list. */
export function KV({ label, value, strong, tone }: KVProps) {
  const { theme } = useAppTheme()
  const color = tone ? toneColors(theme.colors, tone).solid : theme.colors.text
  return (
    <View style={$row}>
      <Text text={label} size="sm" style={[$label, { color: theme.colors.textDim }]} />
      <Text
        text={value}
        size="sm"
        weight={strong ? "bold" : "normal"}
        style={[$value, { color }]}
      />
    </View>
  )
}

/**
 * The label keeps the width its own words need and the value takes what is left; when the two together do not
 * fit, the row wraps and the value drops to the next line.
 *
 * Without that, a narrow column squeezed the label to nothing and React Native broke the word down the screen,
 * one letter per line — "C / he / ck / -in" under a date that had taken the whole row.
 */
const $row: ViewStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "space-between",
  alignItems: "baseline",
  columnGap: 12,
  paddingVertical: 6,
}
const $label: TextStyle = { flexShrink: 0 }
const $value: TextStyle = { flexShrink: 1, textAlign: "right" }
