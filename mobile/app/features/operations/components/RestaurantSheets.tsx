import { useState } from "react"

import {
  Button,
  ChoiceChips,
  Input,
  KV,
  MoneyInput,
  Sheet,
  Switch,
  Text,
  showError,
} from "@/components"
import type { Booking } from "@/features/bookings/types"
import { translate, translateOr } from "@/i18n/translate"
import { api } from "@/services/api"
import { useAppTheme } from "@/theme/context"
import { rupees, toPaise } from "@/utils/format"

import { guestLabel } from "./OrderSheet"
import type { MenuItem, Order } from "../types"

export function SettleSheet({
  order,
  inHouse,
  onClose,
  onEdit,
  onDone,
}: {
  order: Order
  inHouse: Booking[]
  onClose: () => void
  onEdit: () => void
  onDone: (paid: Order | null) => void
}) {
  const { theme } = useAppTheme()
  const [bookingId, setBookingId] = useState<string | null>(order.bookingId)
  const [mode, setMode] = useState("cash")
  const [reason, setReason] = useState("")
  const [cancelling, setCancelling] = useState(false)
  const run = async (
    call: () => Promise<
      { ok: true; data: Order } | { ok: false; problem: import("@/services/api").ApiProblem }
    >,
    paid: boolean,
  ) => {
    const r = await call()
    if (!r.ok) return showError(r.problem)
    onDone(paid ? r.data : null)
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={rupees(order.totalPaise)}
      description={`${order.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")} · ${translate("pos.gstIncluded", { rate: order.taxRateBp / 100 })}`}
    >
      <Button preset="ghost" size="sm" text={translate("pos.editOrder")} onPress={onEdit} />
      <Text
        text={translate("pos.postToRoom")}
        size="xs"
        weight="bold"
        style={{ color: theme.colors.text }}
      />
      <ChoiceChips<string>
        value={bookingId ?? ""}
        onChange={setBookingId}
        options={inHouse.map((b) => ({ value: b.id, label: guestLabel(b) }))}
      />
      <Button
        preset="secondary"
        text={translate("pos.post")}
        disabled={!bookingId}
        onPress={() => void run(() => api.operations.postOrder(order.id, bookingId), false)}
      />
      <Text
        text={translate("pos.payHere")}
        size="xs"
        weight="bold"
        style={{ color: theme.colors.text }}
      />
      <ChoiceChips
        value={mode}
        onChange={setMode}
        options={["cash", "upi", "card"].map((m) => ({
          value: m,
          label: translateOr(`option.${m}`, m.toUpperCase()),
        }))}
      />
      <Button
        text={translate("action.takePayment")}
        onPress={() => void run(() => api.operations.payOrder(order.id, mode), true)}
      />
      <Switch
        value={cancelling}
        onValueChange={setCancelling}
        label={translate("pos.status.cancelled")}
        labelPosition="right"
      />
      {!!cancelling && (
        <>
          <Input label={translate("common.reason")} value={reason} onChangeText={setReason} />
          <Button
            preset="danger"
            text={translate("action.cancel")}
            disabled={!reason.trim()}
            onPress={() =>
              void run(() => api.operations.cancelOrder(order.id, reason.trim()), false)
            }
          />
        </>
      )}
    </Sheet>
  )
}

/** Add or edit a dish. */
export function DishSheet({
  dish,
  onClose,
  onDone,
}: {
  dish: MenuItem | null
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName] = useState(dish?.name ?? "")
  const [category, setCategory] = useState(dish?.category ?? "")
  const [price, setPrice] = useState(dish ? String(dish.pricePaise / 100) : "")
  const [active, setActive] = useState(dish?.active ?? true)
  const submit = async () => {
    const body = {
      name: name.trim(),
      category: category.trim(),
      pricePaise: toPaise(price),
      active,
      sortOrder: dish?.sortOrder ?? 0,
    }
    const r = dish
      ? await api.operations.updateDish(dish.id, body)
      : await api.operations.addDish(body)
    if (!r.ok) return showError(r.problem)
    onDone()
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={dish ? translate("pos.editDish") : translate("pos.addDish")}
      footer={
        <Button
          size="lg"
          text={translate("action.save")}
          onPress={submit}
          disabled={!name.trim() || toPaise(price) < 0}
        />
      }
    >
      <Input label={translate("checkin.name")} value={name} onChangeText={setName} autoFocus />
      <Input label={translate("stay.category")} value={category} onChangeText={setCategory} />
      <MoneyInput label={translate("setup.rate")} value={price} onChangeText={setPrice} />
      {!!dish && (
        <Switch
          value={active}
          onValueChange={setActive}
          label={translate("pos.onMenu")}
          labelPosition="right"
        />
      )}
      <KV label={translate("stay.total")} value={rupees(toPaise(price))} />
    </Sheet>
  )
}
