import { Pressable, View, type ViewStyle, type TextStyle } from "react-native"

import { useAppTheme } from "@/theme/context"
import { toneColors, type Tone } from "@/theme/tones"

import { Text } from "./Text"

export type StatTileProps = {
  label: string
  value: string | number
  tone?: Tone
  hint?: string
  onPress?: () => void
  active?: boolean
  style?: ViewStyle
}

/** A big number with a label; pressable when it filters a list. */
export function StatTile({
  label,
  value,
  tone = "brand",
  hint,
  onPress,
  active,
  style,
}: StatTileProps) {
  const { theme } = useAppTheme()
  const { solid, soft } = toneColors(theme.colors, tone)
  const content = (
    <>
      {/* One line, shrinking if it must: a tile this narrow broke "₹2,000" across two lines as "₹2,00 / 0",
          which reads as a different number. Better small than wrong. */}
      <Text
        text={String(value)}
        style={[$value, { color: theme.colors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      />
      <Text text={label} size="xs" style={{ color: theme.colors.textDim }} numberOfLines={1} />
      {!!hint && (
        <Text text={hint} size="xxs" style={{ color: theme.colors.textFaint }} numberOfLines={1} />
      )}
    </>
  )
  const $box: ViewStyle = {
    ...$tile,
    backgroundColor: active ? soft : theme.colors.surface,
    borderColor: active ? solid : theme.colors.border,
  }
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: !!active }}
        style={[$box, style]}
      >
        {content}
      </Pressable>
    )
  }
  return <View style={[$box, style]}>{content}</View>
}

const $tile: ViewStyle = { borderRadius: 14, borderWidth: 1, padding: 12, minWidth: 110, gap: 2 }
const $value: TextStyle = { fontSize: 24, lineHeight: 30, fontWeight: "800" }
