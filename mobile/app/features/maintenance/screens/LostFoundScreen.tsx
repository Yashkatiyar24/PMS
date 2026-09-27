import { useState } from "react"
import { View, type ViewStyle } from "react-native"

import {
  Avatar,
  Button,
  Chip,
  ChoiceChips,
  Empty,
  ErrorState,
  Input,
  KV,
  ListCard,
  ListRow,
  Loading,
  PageHeader,
  Panel,
  Screen,
  Sheet,
  showError,
} from "@/components"
import { useResource } from "@/hooks/useResource"
import { translate, translateOr } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { formatDateTime } from "@/utils/date"

import { LOST_STATUSES, type LostItem, type LostStatus } from "../types"

/** Things guests left behind: log one, mark it returned or disposed of. */
export function LostFoundScreen() {
  const navigation = useAppNavigation()
  const items = useResource(() => api.maintenance.lostItems(), [], { cacheKey: "lostFound" })
  const rooms = useResource(() => api.rooms.rooms(), [], { cacheKey: "rooms" })
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<LostItem | null>(null)
  const list = items.data ?? []
  const held = list.filter((i) => i.status === "held").length

  return (
    <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={$content}>
      <PageHeader
        title={translate("lost.title")}
        subtitle={`${held} ${translate("lost.status.held")}`}
        onBack={() => navigation.goBack()}
        actions={
          <Button size="sm" text={translate("action.add")} onPress={() => setAdding(true)} />
        }
      />
      <Panel>
        {LOST_STATUSES.map((s) => (
          <KV
            key={s}
            label={translateOr(`lost.status.${s}`, s)}
            value={String(list.filter((i) => i.status === s).length)}
          />
        ))}
      </Panel>
      {items.loading && <Loading />}
      {items.problem && !items.data && (
        <ErrorState message={items.problem.message} onRetry={items.reload} />
      )}
      {items.data && list.length === 0 && <Empty text={translate("empty.lostFound")} />}
      {list.length > 0 && (
        <ListCard>
          {list.map((it, i) => (
            <ListRow
              key={it.id}
              leading={<Avatar glyph="🎒" tone="teal" />}
              title={it.description}
              subtitle={`${it.roomNumber ?? "—"} · ${formatDateTime(it.foundAt)} · ${it.foundByName}`}
              right={
                <Chip
                  tone={it.status === "held" ? "warn" : it.status === "returned" ? "ok" : "neutral"}
                  text={translateOr(`lost.status.${it.status}`, it.status)}
                />
              }
              onPress={() => setOpen(it)}
              last={i === list.length - 1}
            />
          ))}
        </ListCard>
      )}
      {adding && (
        <AddSheet
          rooms={(rooms.data ?? []).map((r) => ({ id: r.id, number: r.number }))}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false)
            void items.reload()
          }}
        />
      )}
      {open && (
        <StatusSheet
          item={open}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null)
            void items.reload()
          }}
        />
      )}
    </Screen>
  )
}

function AddSheet({
  rooms,
  onClose,
  onDone,
}: {
  rooms: { id: string; number: string }[]
  onClose: () => void
  onDone: () => void
}) {
  const [description, setDescription] = useState("")
  const [roomId, setRoomId] = useState<string | null>(null)
  const [notes, setNotes] = useState("")
  const submit = async () => {
    const r = await api.maintenance.addLostItem({
      roomId,
      description: description.trim(),
      notes: notes.trim(),
    })
    if (!r.ok) return showError(r.problem)
    onDone()
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={translate("lost.add")}
      footer={
        <Button
          size="lg"
          text={translate("action.add")}
          onPress={submit}
          disabled={!description.trim()}
        />
      }
    >
      <Input
        label={translate("lost.what")}
        value={description}
        onChangeText={setDescription}
        autoFocus
      />
      <View style={$rooms}>
        {rooms.map((r) => (
          <Button
            key={r.id}
            preset={roomId === r.id ? "primary" : "secondary"}
            size="sm"
            text={r.number}
            onPress={() => setRoomId(roomId === r.id ? null : r.id)}
          />
        ))}
      </View>
      <Input label={translate("rooms.note")} value={notes} onChangeText={setNotes} />
    </Sheet>
  )
}

function StatusSheet({
  item,
  onClose,
  onDone,
}: {
  item: LostItem
  onClose: () => void
  onDone: () => void
}) {
  const [status, setStatus] = useState<LostStatus>(item.status)
  const [returnedTo, setReturnedTo] = useState(item.returnedTo ?? "")
  const submit = async () => {
    const r = await api.maintenance.updateLostItem(item.id, {
      status,
      returnedTo: returnedTo.trim() || null,
      notes: null,
    })
    if (!r.ok) return showError(r.problem)
    onDone()
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={item.description}
      description={item.notes}
      footer={
        <Button
          size="lg"
          text={translate("action.save")}
          onPress={submit}
          disabled={status === "returned" && !returnedTo.trim()}
        />
      }
    >
      <ChoiceChips
        value={status}
        onChange={setStatus}
        options={LOST_STATUSES.map((s) => ({
          value: s,
          label: translateOr(`lost.status.${s}`, s),
        }))}
      />
      {status === "returned" && (
        <Input
          label={translate("lost.returnedTo")}
          value={returnedTo}
          onChangeText={setReturnedTo}
        />
      )}
    </Sheet>
  )
}

const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 32 }
const $rooms: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 6 }
