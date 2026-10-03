import { Pressable, View, type TextStyle, type ViewStyle } from "react-native"

import { Glyph, type GlyphName, Text } from "@/components"
import { useAppTheme } from "@/theme/context"

export type HomeAction = { icon: GlyphName; label: string; onPress: () => void; testID?: string }

/**
 * The four things the desk does without being asked. A square each, in a row, because a list of four verbs
 * reads slower than four buttons.
 */
export function HomeActions({ actions }: { actions: HomeAction[] }) {
  const { theme } = useAppTheme()
  return (
    <View style={$row}>
      {actions.map((a) => (
        <Pressable
          key={a.label}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          testID={a.testID}
          onPress={a.onPress}
          style={({ pressed }) => [$item, pressed && { opacity: 0.7 }]}
        >
          <View style={[$box, { backgroundColor: theme.colors.palette.brandSoft }]}>
            <Glyph name={a.icon} size={24} color={theme.colors.palette.brandInk} weight={1.9} />
          </View>
          <Text
            text={a.label}
            size="xs"
            numberOfLines={2}
            style={[$label, { color: theme.colors.text }]}
          />
        </Pressable>
      ))}
    </View>
  )
}

const $row: ViewStyle = { flexDirection: "row", gap: 10 }
const $item: ViewStyle = { flex: 1, alignItems: "center", gap: 6 }
const $box: ViewStyle = {
  width: "100%",
  aspectRatio: 1.3,
  borderRadius: 18,
  alignItems: "center",
  justifyContent: "center",
}
const $label: TextStyle = { textAlign: "center" }
