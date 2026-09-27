import { useState } from "react"
import { View, type ViewStyle } from "react-native"

import {
  ActionSheet,
  Avatar,
  Button,
  Chip,
  Empty,
  ErrorState,
  ListCard,
  ListRow,
  Loading,
  PageHeader,
  Screen,
  SectionLabel,
} from "@/components"
import { useResource } from "@/hooks/useResource"
import { translate } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { rupees } from "@/utils/format"

import { RoomEditSheet } from "../components/RoomEditSheet"
import { AddRoomsSheet, RoomTypeSheet } from "../components/RoomSetupSheets"
import type { Room, RoomType } from "../types"

/** Room types and rates, and the rooms (single, bulk range, edit, dormitory beds). */
export function RoomTypesScreen() {
  const navigation = useAppNavigation()
  const types = useResource(() => api.rooms.roomTypes(), [], { cacheKey: "roomTypes" })
  const rooms = useResource(() => api.rooms.rooms(), [], { cacheKey: "rooms" })
  const [menu, setMenu] = useState(false)
  const [type, setType] = useState<RoomType | "new" | null>(null)
  const [addingRooms, setAddingRooms] = useState(false)
  const [room, setRoom] = useState<Room | null>(null)
  const list = types.data ?? []
  const roomList = rooms.data ?? []
  const reload = () => {
    void types.reload()
    void rooms.reload()
  }
  const currentRoom = room ? (roomList.find((r) => r.id === room.id) ?? room) : null

  return (
    <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={$content}>
      <PageHeader
        title={translate("setup.roomTypes")}
        subtitle={`${list.length} · ${translate("setup.rooms")} ${roomList.length}`}
        onBack={() => navigation.goBack()}
        actions={<Button size="sm" text={translate("action.add")} onPress={() => setMenu(true)} />}
      />
      {types.loading && <Loading />}
      {types.problem && !types.data && (
        <ErrorState message={types.problem.message} onRetry={types.reload} />
      )}
      {types.data && list.length === 0 && (
        <Empty
          text={translate("empty.roomTypes")}
          actionText={translate("setup.addRoomType")}
          onAction={() => setType("new")}
        />
      )}
      {list.length > 0 && (
        <ListCard>
          {list.map((t, i) => (
            <ListRow
              key={t.id}
              leading={<Avatar name={t.name} tone={t.dormitory ? "violet" : "teal"} />}
              title={t.name}
              subtitle={`${rupees(t.baseRatePaise)} · ${t.dormitory ? `${t.bedCount} ${translate("setup.beds").toLowerCase()}` : `${t.maxOccupancy} ${translate("res.guests").toLowerCase()}`} · ${translate("setup.rooms")} ${roomList.filter((r) => r.roomTypeId === t.id).length}`}
              right={t.dormitory ? <Chip tone="violet" text="dorm" /> : undefined}
              struck={!t.active}
              onPress={() => setType(t)}
              last={i === list.length - 1}
            />
          ))}
        </ListCard>
      )}
      {roomList.length > 0 && (
        <>
          <SectionLabel text={translate("setup.rooms")} />
          <View style={$chips}>
            {roomList.map((r) => (
              <Button
                key={r.id}
                preset={r.active ? "secondary" : "ghost"}
                size="sm"
                text={`${r.building ? `${r.building} ` : ""}${r.number}`}
                onPress={() => setRoom(r)}
              />
            ))}
          </View>
        </>
      )}
      <ActionSheet
        open={menu}
        onClose={() => setMenu(false)}
        title={translate("action.add")}
        items={[
          { label: translate("setup.addRoomType"), onPress: () => setType("new") },
          {
            label: translate("setup.addRooms"),
            onPress: () => setAddingRooms(true),
            disabled: list.length === 0,
          },
        ]}
      />
      {type && (
        <RoomTypeSheet
          type={type === "new" ? null : type}
          onClose={() => setType(null)}
          onDone={() => {
            setType(null)
            reload()
          }}
        />
      )}
      {addingRooms && (
        <AddRoomsSheet
          types={list}
          onClose={() => setAddingRooms(false)}
          onDone={() => {
            setAddingRooms(false)
            reload()
          }}
        />
      )}
      {currentRoom && (
        <RoomEditSheet
          room={currentRoom}
          types={list}
          onClose={() => setRoom(null)}
          onChanged={(r) => rooms.set((rs) => rs.map((x) => (x.id === r.id ? r : x)))}
          onDone={() => {
            setRoom(null)
            reload()
          }}
        />
      )}
    </Screen>
  )
}

const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 32 }
const $chips: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 6 }
