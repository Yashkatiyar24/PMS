import { useEffect, useState } from "react"
import { View, type ViewStyle } from "react-native"

import {
  Button,
  ChoiceChips,
  Input,
  ListRow,
  Loading,
  MoneyInput,
  Sheet,
  Switch,
  Text,
  showError,
} from "@/components"
import { translate, translateOr } from "@/i18n/translate"
import { api } from "@/services/api"
import { useAppTheme } from "@/theme/context"
import { formatDateTime } from "@/utils/date"
import { toPaise } from "@/utils/format"

import {
  MOVEMENT_KINDS,
  STOCK_CATEGORIES,
  type Movement,
  type MovementKind,
  type StockCategory,
  type StockItem,
} from "../types"

/** Add or edit a stock item. */
export function StockItemSheet({
  item,
  onClose,
  onDone,
}: {
  item: StockItem | null
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName] = useState(item?.name ?? "")
  const [category, setCategory] = useState<StockCategory>(item?.category ?? "cleaning")
  const [unit, setUnit] = useState(item?.unit ?? "pcs")
  const [threshold, setThreshold] = useState(String(item?.lowStockThreshold ?? 0))
  const [active, setActive] = useState(item?.active ?? true)
  const submit = async () => {
    const body = {
      name: name.trim(),
      category,
      unit: unit.trim() || "pcs",
      lowStockThreshold: parseFloat(threshold) || 0,
      active,
    }
    const r = item
      ? await api.operations.updateStockItem(item.id, body)
      : await api.operations.addStockItem(body)
    if (!r.ok) return showError(r.problem)
    onDone()
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={item ? translate("stock.editItem") : translate("stock.addItem")}
      footer={
        <Button
          size="lg"
          text={translate("action.save")}
          onPress={submit}
          disabled={!name.trim()}
        />
      }
    >
      <Input label={translate("checkin.name")} value={name} onChangeText={setName} autoFocus />
      <ChoiceChips
        value={category}
        onChange={setCategory}
        options={STOCK_CATEGORIES.map((c) => ({
          value: c,
          label: translateOr(`stock.cat.${c}`, c),
        }))}
      />
      <Input
        label={translate("stock.unit")}
        value={unit}
        onChangeText={setUnit}
        placeholder="pcs, kg, litre"
      />
      <Input
        label={translate("stock.lowLineLabel")}
        value={threshold}
        onChangeText={(t) => setThreshold(t.replace(/[^\d.]/g, ""))}
        keyboardType="decimal-pad"
      />
      {item && (
        <Switch
          value={active}
          onValueChange={setActive}
          label={translate("stock.inUse")}
          labelPosition="right"
        />
      )}
    </Sheet>
  )
}

/** Record a movement for an item and see its history. */
export function MovementSheet({
  item,
  rooms,
  onClose,
  onEdit,
  onDone,
}: {
  item: StockItem
  rooms: { id: string; number: string }[]
  onClose: () => void
  onEdit: () => void
  onDone: () => void
}) {
  const { theme } = useAppTheme()
  const [kind, setKind] = useState<MovementKind>("purchase")
  const [qty, setQty] = useState("")
  const [cost, setCost] = useState("")
  const [roomId, setRoomId] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [history, setHistory] = useState<Movement[] | null>(null)
  useEffect(() => {
    void api.operations.movements(item.id).then((r) => setHistory(r.ok ? r.data : []))
  }, [item.id])
  const kinds = MOVEMENT_KINDS.filter(
    (k) => item.category === "linen" || (k !== "to_laundry" && k !== "from_laundry"),
  )
  const submit = async () => {
    const r = await api.operations.addMovement(item.id, {
      kind,
      qty: parseFloat(qty),
      unitCostPaise: kind === "purchase" && cost ? toPaise(cost) : null,
      roomId: kind === "consumption" ? roomId : null,
      note: note.trim(),
    })
    if (!r.ok) return showError(r.problem)
    onDone()
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={item.name}
      description={`${item.onHand} ${item.unit}`}
      footer={
        <Button
          size="lg"
          text={translate("action.save")}
          onPress={submit}
          disabled={!qty || Number.isNaN(parseFloat(qty))}
        />
      }
    >
      <ChoiceChips
        value={kind}
        onChange={setKind}
        options={kinds.map((k) => ({ value: k, label: translateOr(`stock.kind.${k}`, k) }))}
      />
      <Input
        label={`${translate("stay.qty")} (${item.unit})`}
        hint={kind === "adjustment" ? translate("stock.adjustHint") : undefined}
        value={qty}
        onChangeText={(t) => setQty(t.replace(/[^\d.-]/g, ""))}
        keyboardType="numbers-and-punctuation"
        autoFocus
      />
      {kind === "purchase" && (
        <MoneyInput label={translate("stock.unitCost")} value={cost} onChangeText={setCost} />
      )}
      {kind === "consumption" && (
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
      )}
      <Input label={translate("rooms.note")} value={note} onChangeText={setNote} />
      <Button preset="ghost" size="sm" text={translate("stock.editItem")} onPress={onEdit} />
      <Text
        text={translate("stock.history")}
        size="xs"
        weight="bold"
        style={{ color: theme.colors.text }}
      />
      {!history && <Loading rows={1} />}
      {history && history.length === 0 && (
        <Text
          text={translate("empty.stockHistory")}
          size="sm"
          style={{ color: theme.colors.textDim }}
        />
      )}
      {history?.map((m, i) => (
        <ListRow
          key={m.id}
          title={`${translateOr(`stock.kind.${m.kind}`, m.kind)}${m.roomNumber ? ` · ${m.roomNumber}` : ""}`}
          subtitle={`${formatDateTime(m.at)} · ${m.byName}${m.note ? ` · ${m.note}` : ""}`}
          right={
            <Text
              text={`${m.qtyChange > 0 ? "+" : ""}${m.qtyChange}`}
              weight="bold"
              style={{
                color: m.qtyChange >= 0 ? theme.colors.palette.ok : theme.colors.palette.danger,
              }}
            />
          }
          chevron={false}
          last={i === history.length - 1}
        />
      ))}
    </Sheet>
  )
}

const $rooms: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 6 }
