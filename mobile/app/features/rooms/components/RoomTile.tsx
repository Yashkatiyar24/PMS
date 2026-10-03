import { Pressable, View, type TextStyle, type ViewStyle } from "react-native"

import { Text } from "@/components"
import { useAppTheme } from "@/theme/context"

import { chipLook } from "../lib/roomLabels"
import type { Room } from "../types"

/**
 * One room in the grid, the reference's housekeeping board: a square chip with the number on it, its fill
 * telling the housekeeping state — dirty a pale red, inspected a teal tint, clean plain white, off sale grey —
 * and the dot repeating the tone so status never rides on the fill alone. An occupied room gets a solid ink
 * bar under the number so the board shows fullness at a glance.
 */
export function RoomTile({
  room,
  onPress,
  selected,
}: {
  room: Room
  onPress: () => void
  selected?: boolean
}) {
  const { theme } = useAppTheme()
  const look = chipLook(theme.colors, room)
  const bg = selected ? theme.colors.palette.brand : look.bg
  const fg = selected ? theme.colors.onSolid : look.fg
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={`${room.number} ${room.status}${look.taken ? " occupied" : ""}`}
      style={({ pressed }) => [
        $chip,
        {
          backgroundColor: bg,
          borderColor: selected ? theme.colors.palette.brand : look.border,
          shadowColor: theme.colors.palette.shadow,
          opacity: room.active ? (pressed ? 0.75 : 1) : 0.45,
        },
      ]}
    >
      <Text text={room.number} style={[$number, { color: fg }]} numberOfLines={1} />
      <View style={$marks}>
        <View style={[$dot, { backgroundColor: selected ? theme.colors.onSolid : look.dot }]} />
        {!!look.taken && (
          <View style={[$bar, { backgroundColor: selected ? theme.colors.onSolid : look.dot }]} />
        )}
        {room.hkPriority === "high" && (
          <Text text="!" style={[$bang, { color: selected ? fg : theme.colors.palette.warn }]} />
        )}
      </View>
    </Pressable>
  )
}

const $chip: ViewStyle = {
  flexBasis: "17%",
  flexGrow: 1,
  aspectRatio: 1,
  maxWidth: 72,
  borderRadius: 14,
  borderWidth: 1,
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 1,
}
const $number: TextStyle = { fontSize: 15, fontWeight: "700", letterSpacing: -0.2 }
const $marks: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 3, minHeight: 8 }
const $dot: ViewStyle = { width: 6, height: 6, borderRadius: 3 }
const $bar: ViewStyle = { width: 14, height: 3, borderRadius: 2 }
const $bang: TextStyle = { fontSize: 11, lineHeight: 12, fontWeight: "800" }
