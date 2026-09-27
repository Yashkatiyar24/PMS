import { View, type ViewStyle } from "react-native"

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
      <Text text={label} size="sm" style={{ color: theme.colors.textDim, flex: 1 }} />
      <Text text={value} size="sm" weight={strong ? "bold" : "normal"} style={{ color }} />
    </View>
  )
}

const $row: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  gap: 12,
  paddingVertical: 6,
}
