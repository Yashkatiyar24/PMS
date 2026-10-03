import { Pressable, View, type ViewStyle, type TextStyle } from "react-native"

import { useAppTheme } from "@/theme/context"

import { afterSheetCloses, Sheet } from "./Sheet"
import { Text } from "./Text"

export type ActionItem = {
  label: string
  onPress: () => void
  danger?: boolean
  disabled?: boolean
  /** Draw a separator above this item. */
  separator?: boolean
}

export type ActionSheetProps = {
  open: boolean
  onClose: () => void
  title: string
  items: ActionItem[]
}

/** The overflow menu: a list of actions in a sheet (the web's `Menu`). */
export function ActionSheet({ open, onClose, title, items }: ActionSheetProps) {
  const { theme } = useAppTheme()
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <View>
        {items.map((item, i) => (
          <View key={`${item.label}-${i}`}>
            {!!item.separator && <View style={[$sep, { backgroundColor: theme.colors.border }]} />}
            <Pressable
              disabled={item.disabled}
              accessibilityRole="menuitem"
              onPress={() => {
                onClose()
                afterSheetCloses(item.onPress)
              }}
              style={({ pressed }) => [
                $item,
                pressed && { backgroundColor: theme.colors.surface2 },
                item.disabled && { opacity: 0.45 },
              ]}
            >
              <Text
                text={item.label}
                style={[
                  $label,
                  { color: item.danger ? theme.colors.palette.danger : theme.colors.text },
                ]}
              />
            </Pressable>
          </View>
        ))}
      </View>
    </Sheet>
  )
}

const $item: ViewStyle = {
  minHeight: 48,
  justifyContent: "center",
  paddingHorizontal: 8,
  borderRadius: 10,
}
const $label: TextStyle = { fontSize: 16, fontWeight: "500" }
const $sep: ViewStyle = { height: 1, marginVertical: 6 }
