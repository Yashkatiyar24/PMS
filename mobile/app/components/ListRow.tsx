import { type ReactNode } from "react"
import { Pressable, View, type ViewStyle, type TextStyle } from "react-native"

import { useAppTheme } from "@/theme/context"

import { Glyph } from "./Glyph"
import { Text } from "./Text"

export type ListRowProps = {
  title: string
  subtitle?: string
  leading?: ReactNode
  right?: ReactNode
  onPress?: () => void
  onLongPress?: () => void
  /** Show a chevron at the end (default when pressable). */
  chevron?: boolean
  /** Strike the title (voided, inactive). */
  struck?: boolean
  last?: boolean
}

/** One tappable row: leading avatar, title/subtitle, right slot, chevron. */
export function ListRow({
  title,
  subtitle,
  leading,
  right,
  onPress,
  onLongPress,
  chevron,
  struck,
  last,
}: ListRowProps) {
  const { theme } = useAppTheme()
  const showChevron = chevron ?? !!onPress
  const body = (
    <>
      {leading}
      <View style={$text}>
        <Text
          text={title}
          style={[$title, { color: theme.colors.text }, struck && $struck]}
          numberOfLines={2}
        />
        {!!subtitle && (
          <Text
            text={subtitle}
            size="xs"
            style={{ color: theme.colors.textDim }}
            numberOfLines={2}
          />
        )}
      </View>
      {right}
      {!!showChevron && <Glyph name="chevronRight" size={18} color={theme.colors.textFaint} />}
    </>
  )
  const $line: ViewStyle = last
    ? {}
    : { borderBottomWidth: 1, borderBottomColor: theme.colors.border }
  if (onPress || onLongPress) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        style={({ pressed }) => [
          $row,
          $line,
          pressed && { backgroundColor: theme.colors.surface2 },
        ]}
      >
        {body}
      </Pressable>
    )
  }
  return <View style={[$row, $line]}>{body}</View>
}

/** A white card that holds ListRows with hairline dividers, lifted by a soft shadow rather than a border. */
export function ListCard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { theme } = useAppTheme()
  return (
    <View
      style={[
        $card,
        { backgroundColor: theme.colors.surface, shadowColor: theme.colors.palette.shadow },
        style,
      ]}
    >
      {children}
    </View>
  )
}

const $row: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 12,
  minHeight: 56,
  paddingHorizontal: 14,
  paddingVertical: 10,
}
const $text: ViewStyle = { flex: 1, gap: 2 }
const $title: TextStyle = { fontSize: 15, fontWeight: "600" }
const $struck: TextStyle = { textDecorationLine: "line-through", opacity: 0.6 }
const $card: ViewStyle = {
  borderRadius: 18,
  overflow: "hidden",
  shadowOpacity: 0.07,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
}
