import { type ReactNode } from "react"
import { View, type ViewStyle, type TextStyle } from "react-native"

import { useAppTheme } from "@/theme/context"

import { Glyph, type GlyphName } from "./Glyph"
import { Text } from "./Text"

/**
 * A group's heading as the reference sets it: a small line icon and the words in spaced capitals, grey, so the
 * eye reads the fields under it before the heading itself. An optional slot at the right for a total.
 */
export function SectionLabel({
  text,
  icon,
  right,
}: {
  text: string
  icon?: GlyphName
  right?: ReactNode
}) {
  const { theme } = useAppTheme()
  return (
    <View style={$row}>
      <View style={$left}>
        {!!icon && <Glyph name={icon} size={15} color={theme.colors.textDim} />}
        <Text text={text.toUpperCase()} style={[$label, { color: theme.colors.textDim }]} />
      </View>
      {right}
    </View>
  )
}

/** A white card lifted by a soft shadow rather than a border; the container most screens build from. */
export function Panel({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { theme } = useAppTheme()
  return (
    <View
      style={[
        $panel,
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
  justifyContent: "space-between",
  marginTop: 14,
  marginBottom: 6,
  paddingHorizontal: 2,
}
const $left: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 7 }
const $label: TextStyle = { fontSize: 11, lineHeight: 14, fontWeight: "700", letterSpacing: 1.2 }
const $panel: ViewStyle = {
  borderRadius: 18,
  padding: 16,
  gap: 12,
  shadowOpacity: 0.07,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
}
