import { Pressable, View, type ViewStyle, type TextStyle } from "react-native"

import { useAppTheme } from "@/theme/context"
import { toneColors, type Tone } from "@/theme/tones"
import { typography } from "@/theme/typography"

import { Glyph, type GlyphName } from "./Glyph"
import { Text } from "./Text"

export type StatTileProps = {
  label: string
  value: string | number
  tone?: Tone
  hint?: string
  icon?: GlyphName
  onPress?: () => void
  active?: boolean
  style?: ViewStyle
}

/**
 * A big number on a white card, the reference's "10 Rooms" tile: a line icon in the tone's tint at the top,
 * the figure under it, and the words last. Pressable when it filters a list; the chosen one goes teal.
 */
export function StatTile({
  label,
  value,
  tone = "brand",
  hint,
  icon,
  onPress,
  active,
  style,
}: StatTileProps) {
  const { theme } = useAppTheme()
  const { solid, soft } = toneColors(theme.colors, tone)
  const content = (
    <>
      {!!icon && (
        <View style={[$glyph, { backgroundColor: active ? theme.colors.surface : soft }]}>
          <Glyph name={icon} size={16} color={solid} />
        </View>
      )}
      {/* One line, shrinking if it must: a tile this narrow broke "₹2,000" across two lines as "₹2,00 / 0",
          which reads as a different number. Better small than wrong. */}
      <Text
        text={String(value)}
        style={[$value, { color: theme.colors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      />
      <Text text={label} size="xs" style={{ color: theme.colors.textDim }} numberOfLines={2} />
      {!!hint && (
        <Text text={hint} size="xxs" style={{ color: theme.colors.textFaint }} numberOfLines={1} />
      )}
    </>
  )
  const $box: ViewStyle = {
    ...$tile,
    backgroundColor: active ? soft : theme.colors.surface,
    borderColor: active ? solid : "transparent",
    shadowColor: theme.colors.palette.shadow,
  }
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: !!active }}
        style={({ pressed }) => [$box, pressed && { opacity: 0.85 }, style]}
      >
        {content}
      </Pressable>
    )
  }
  return <View style={[$box, style]}>{content}</View>
}

const $tile: ViewStyle = {
  borderRadius: 18,
  borderWidth: 1,
  padding: 14,
  minWidth: 112,
  gap: 2,
  shadowOpacity: 0.07,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
}
const $glyph: ViewStyle = {
  width: 32,
  height: 32,
  borderRadius: 10,
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 6,
}
const $value: TextStyle = {
  fontFamily: typography.display.bold,
  fontSize: 28,
  lineHeight: 34,
  fontWeight: "700",
  letterSpacing: -0.5,
}
