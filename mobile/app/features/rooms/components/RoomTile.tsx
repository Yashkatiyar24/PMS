import { Pressable, View, type TextStyle, type ViewStyle } from "react-native"

import { Text } from "@/components"
import { useAppTheme } from "@/theme/context"
import { toneColors } from "@/theme/tones"

import { occupancySummary, statusTone } from "../lib/roomLabels"
import type { Room } from "../types"

/**
 * One room in the grid: just the number on a chip, tinted by housekeeping status, with everything else a tap
 * away in the sheet. An occupied room goes solid ink so the board shows fullness at a glance; the dot repeats
 * the housekeeping tone so status never rides on the fill alone.
 */
export function RoomTile({ room, onPress }: { room: Room; onPress: () => void }) {
  const { theme } = useAppTheme()
  const tone = toneColors(theme.colors, statusTone(room.status))
  const occ = occupancySummary(room)
  const taken = occ.key === "occupied" || (occ.key === "beds" && (occ.taken ?? 0) > 0)
  const clean = room.status === "clean" || room.status === "inspected"
  const bg = taken ? theme.colors.palette.brand : clean ? theme.colors.surface : tone.soft
  const fg = taken ? theme.colors.onSolid : theme.colors.text
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${room.number} ${room.status}${taken ? " occupied" : ""}`}
      style={[
        $chip,
        {
          backgroundColor: bg,
          borderColor: taken ? theme.colors.palette.brand : theme.colors.border,
          opacity: room.active ? 1 : 0.5,
        },
      ]}
    >
      <Text text={room.number} style={[$number, { color: fg }]} numberOfLines={1} />
      <View style={$marks}>
        <View style={[$dot, { backgroundColor: taken ? theme.colors.onSolid : tone.solid }]} />
        {room.hkPriority === "high" && (
          <Text text="!" size="xxs" style={{ color: taken ? fg : theme.colors.palette.warn }} />
        )}
      </View>
    </Pressable>
  )
}

const $chip: ViewStyle = {
  flexBasis: "17%",
  flexGrow: 1,
  borderRadius: 12,
  borderWidth: 1,
  paddingVertical: 12,
  alignItems: "center",
  gap: 4,
}
const $number: TextStyle = { fontSize: 15, fontWeight: "700" }
const $marks: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 3, minHeight: 8 }
const $dot: ViewStyle = { width: 6, height: 6, borderRadius: 3 }
