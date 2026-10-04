import { View, type ViewStyle, type TextStyle } from "react-native"

import { useAppTheme } from "@/theme/context"
import { toneColors, type Tone } from "@/theme/tones"

import { Text } from "./Text"

export type ChipProps = {
  tone?: Tone
  text: string
  /** A small dot before the text, for statuses. */
  dot?: boolean
  style?: ViewStyle
}

/** A small tinted pill: state, payment status, count. Status never rides on the colour alone; the word is there. */
export function Chip({ tone = "neutral", text, dot, style }: ChipProps) {
  const { theme } = useAppTheme()
  const { solid, soft } = toneColors(theme.colors, tone)
  return (
    <View style={[$chip, { backgroundColor: soft }, style]}>
      {!!dot && <View style={[$dot, { backgroundColor: solid }]} />}
      <Text text={text} style={[$text, { color: solid }]} numberOfLines={1} />
    </View>
  )
}

const $chip: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  alignSelf: "flex-start",
  borderRadius: 999,
  paddingHorizontal: 9,
  paddingVertical: 3,
  gap: 6,
  minHeight: 22,
}
const $dot: ViewStyle = { width: 6, height: 6, borderRadius: 3 }
const $text: TextStyle = { fontSize: 12, lineHeight: 16, fontWeight: "600" }
