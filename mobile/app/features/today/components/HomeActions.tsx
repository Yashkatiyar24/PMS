import { Pressable, View, type TextStyle, type ViewStyle } from "react-native"

import { Text } from "@/components"
import { useAppTheme } from "@/theme/context"

export type HomeAction = { glyph: string; label: string; onPress: () => void }

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
          onPress={a.onPress}
          style={$item}
        >
          <View
            style={[
              $box,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <Text
              text={a.glyph}
              style={{ fontSize: 20, lineHeight: 24, color: theme.colors.palette.brand }}
            />
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
  aspectRatio: 1.15,
  borderRadius: 18,
  borderWidth: 1,
  alignItems: "center",
  justifyContent: "center",
}
const $label: TextStyle = { textAlign: "center" }
