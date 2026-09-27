import { type ReactNode } from "react"
import { View, type ViewStyle, type TextStyle } from "react-native"

import { useAppTheme } from "@/theme/context"

import { Text } from "./Text"

/** Small uppercase label above a group, with an optional right slot. */
export function SectionLabel({ text, right }: { text: string; right?: ReactNode }) {
  const { theme } = useAppTheme()
  return (
    <View style={$row}>
      <Text text={text.toUpperCase()} style={[$label, { color: theme.colors.textFaint }]} />
      {right}
    </View>
  )
}

/** A surface card with padding; the container most screens build from. */
export function Panel({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { theme } = useAppTheme()
  return (
    <View
      style={[
        $panel,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
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
  justifyContent: "space-between",
  marginTop: 12,
  marginBottom: 6,
}
const $label: TextStyle = { fontSize: 11, fontWeight: "700", letterSpacing: 0.8 }
const $panel: ViewStyle = { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 }
