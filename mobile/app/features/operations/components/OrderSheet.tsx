import { useState } from "react"
import { View, type ViewStyle } from "react-native"

import {
  Button,
  ChoiceChips,
  Input,
  MoneyInput,
  Sheet,
  Stepper,
  Text,
  showError,
} from "@/components"
import type { Booking } from "@/features/bookings/types"
import { translate } from "@/i18n/translate"
import { api } from "@/services/api"
import { useAppTheme } from "@/theme/context"
import { rupees, toPaise, unitName } from "@/utils/format"

import type { MenuItem, Order, OrderLineInput } from "../types"

export const guestLabel = (b: Booking) =>
  `${b.units.map((u) => unitName(u.roomNumber, u.bedLabel)).join(", ")} · ${b.guestName}`

/** Take or change an order: for the counter or an in-house guest; lines from the menu or ad hoc. */
export function OrderSheet({
  order,
  menu,
  inHouse,
  onClose,
  onDone,
}: {
  order: Order | null
  menu: MenuItem[]
  inHouse: Booking[]
  onClose: () => void
  onDone: () => void
}) {
  const { theme } = useAppTheme()
  const [bookingId, setBookingId] = useState<string | null>(order?.bookingId ?? null)
  const [tableLabel, setTableLabel] = useState(order?.tableLabel ?? "")
  const [lines, setLines] = useState<OrderLineInput[]>(
    order?.lines.map((l) => ({
      menuItemId: l.menuItemId,
      name: l.name,
      unitPaise: l.unitPaise,
      qty: l.qty,
    })) ?? [],
  )
  const [custom, setCustom] = useState({ name: "", price: "" })
  const priceOf = (l: OrderLineInput) =>
    l.unitPaise ?? menu.find((m) => m.id === l.menuItemId)?.pricePaise ?? 0
  const subtotal = lines.reduce((s, l) => s + priceOf(l) * l.qty, 0)

  const add = (m: MenuItem) =>
    setLines((ls) =>
      ls.some((l) => l.menuItemId === m.id)
        ? ls.map((l) => (l.menuItemId === m.id ? { ...l, qty: l.qty + 1 } : l))
        : [...ls, { menuItemId: m.id, name: null, unitPaise: null, qty: 1 }],
    )
  const setQty = (i: number, qty: number) =>
    setLines((ls) =>
      qty <= 0 ? ls.filter((_, j) => j !== i) : ls.map((l, j) => (j === i ? { ...l, qty } : l)),
    )
  const submit = async () => {
    const r = order
      ? await api.operations.setOrderLines(order.id, lines)
      : await api.operations.createOrder({
          bookingId,
          tableLabel: bookingId ? null : tableLabel.trim() || null,
          lines,
        })
    if (!r.ok) return showError(r.problem)
    onDone()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={order ? translate("pos.editOrder") : translate("pos.newOrder")}
      footer={
        <Button
          size="lg"
          text={`${translate("action.save")} · ${rupees(subtotal)}`}
          onPress={submit}
          disabled={lines.length === 0}
        />
      }
    >
      {!order && (
        <>
          <Text
            text={translate("pos.forRoom")}
            size="xs"
            weight="bold"
            style={{ color: theme.colors.text }}
          />
          <ChoiceChips<string>
            value={bookingId ?? "counter"}
            onChange={(v) => setBookingId(v === "counter" ? null : v)}
            options={[
              { value: "counter", label: translate("pos.counter") },
              ...inHouse.map((b) => ({ value: b.id, label: guestLabel(b) })),
            ]}
          />
          {!bookingId && (
            <Input label={translate("pos.table")} value={tableLabel} onChangeText={setTableLabel} />
          )}
        </>
      )}
      <View style={$menu}>
        {menu
          .filter((m) => m.active)
          .map((m) => (
            <Button
              key={m.id}
              preset="secondary"
              size="sm"
              text={`${m.name} · ${rupees(m.pricePaise)}`}
              onPress={() => add(m)}
            />
          ))}
      </View>
      <View style={$custom}>
        <View style={$grow}>
          <Input
            label={translate("pos.offMenu")}
            value={custom.name}
            onChangeText={(name) => setCustom((c) => ({ ...c, name }))}
          />
        </View>
        <View style={$price}>
          <MoneyInput
            label="₹"
            value={custom.price}
            onChangeText={(price) => setCustom((c) => ({ ...c, price }))}
          />
        </View>
        <Button
          size="sm"
          text="+"
          disabled={!custom.name.trim() || toPaise(custom.price) <= 0}
          onPress={() => {
            setLines((ls) => [
              ...ls,
              {
                menuItemId: null,
                name: custom.name.trim(),
                unitPaise: toPaise(custom.price),
                qty: 1,
              },
            ])
            setCustom({ name: "", price: "" })
          }}
        />
      </View>
      {lines.map((l, i) => (
        <Stepper
          key={`${l.menuItemId ?? l.name}-${i}`}
          label={`${l.name ?? menu.find((m) => m.id === l.menuItemId)?.name ?? ""} · ${rupees(priceOf(l))}`}
          value={l.qty}
          onChange={(q) => setQty(i, q)}
        />
      ))}
    </Sheet>
  )
}

/** Settle an open order: charge to a room, pay here, or cancel. */

const $menu: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 6 }
const $custom: ViewStyle = { flexDirection: "row", alignItems: "flex-end", gap: 6 }
const $grow: ViewStyle = { flex: 1 }
const $price: ViewStyle = { width: 110 }
