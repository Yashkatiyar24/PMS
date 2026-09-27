import { Pressable, View, type ViewStyle, type TextStyle } from "react-native"

import { Chip, Text } from "@/components"
import { translate, translateOr } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { toneColors } from "@/theme/tones"

import { occupancySummary, statusTone } from "../lib/roomLabels"
import type { Room } from "../types"

/** One room in the grid: colour bar, number, type, status chip, occupancy line, housekeeper. */
export function RoomTile({ room, onPress }: { room: Room; onPress: () => void }) {
  const { theme } = useAppTheme()
  const tone = statusTone(room.status)
  const { solid } = toneColors(theme.colors, tone)
  const occ = occupancySummary(room)
  const occText =
    occ.key === "beds"
      ? translate("rooms.bedsTaken", { n: occ.taken, total: occ.total })
      : occ.key === "occupied"
        ? translate("rooms.occupied")
        : occ.key === "reserved"
          ? translate("rooms.reserved")
          : translate("rooms.available")
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${room.number} ${room.status}`}
      style={[
        $tile,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          opacity: room.active ? 1 : 0.5,
        },
      ]}
    >
      <View style={[$bar, { backgroundColor: solid }]} />
      <View style={$head}>
        <Text
          text={room.number}
          style={[$number, { color: theme.colors.text }]}
          numberOfLines={1}
        />
        {room.hkPriority === "high" && (
          <Text text="⚠" style={{ color: theme.colors.palette.warn }} />
        )}
      </View>
      <Text
        text={room.roomTypeName}
        size="xxs"
        style={{ color: theme.colors.textDim }}
        numberOfLines={1}
      />
      <Chip tone={tone} text={translateOr(`rooms.status.${room.status}`, room.status)} />
      <Text
        text={occText}
        size="xxs"
        style={{ color: occ.key === "available" ? theme.colors.palette.ok : theme.colors.textDim }}
        numberOfLines={1}
      />
      {!!room.housekeeperName && (
        <Text
          text={room.housekeeperName}
          size="xxs"
          style={{ color: theme.colors.textFaint }}
          numberOfLines={1}
        />
      )}
    </Pressable>
  )
}

const $tile: ViewStyle = {
  flexBasis: "31%",
  flexGrow: 1,
  borderRadius: 14,
  borderWidth: 1,
  padding: 10,
  gap: 4,
  overflow: "hidden",
}
const $bar: ViewStyle = { position: "absolute", top: 0, left: 0, right: 0, height: 4 }
const $head: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 2,
}
const $number: TextStyle = { fontSize: 18, fontWeight: "800" }
