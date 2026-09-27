import { View, type ViewStyle } from "react-native"

import { Button, type ActionItem } from "@/components"
import type { Folio } from "@/features/folio/types"
import { translate } from "@/i18n/translate"

import { balanceDue } from "../../lib/bookingLabels"
import type { Booking } from "../../types"

export type StaySheet =
  | "pay"
  | "extra"
  | "discount"
  | "refund"
  | "creditNote"
  | "cancel"
  | "noShow"
  | "checkoutOverride"
  | "editDetails"
  | "party"
  | "addUnit"
  | "changeUnit"
  | "release"
  | null

export type Can = {
  edit: boolean
  refund: boolean
  invoice: boolean
  checkout: boolean
  checkin: boolean
}

export type StayActionsProps = {
  booking: Booking
  folio: Folio | null
  can: Can
  busy: boolean
  open: (sheet: StaySheet) => void
  onConfirm: () => void
  onArrive: () => void
  onCheckOut: () => void
  onInvoice: () => void
}

/** The primary buttons for the booking's state (Confirm, Mark arrived, Take payment, Check out, Invoice). */
export function StayActions({
  booking,
  folio,
  can,
  busy,
  open,
  onConfirm,
  onArrive,
  onCheckOut,
  onInvoice,
}: StayActionsProps) {
  const due = folio ? balanceDue(folio) : booking.balanceDuePaise
  const s = booking.state
  return (
    <View style={$row}>
      {s === "pending" && can.edit && (
        <Button
          text={translate("stay.confirm")}
          onPress={onConfirm}
          disabled={busy}
          style={$grow}
        />
      )}
      {(s === "reserved" || s === "pending") && can.checkin && (
        <Button
          preset={s === "pending" ? "secondary" : "primary"}
          text={translate("action.arrive")}
          onPress={onArrive}
          disabled={busy}
          style={$grow}
        />
      )}
      {s === "checked_in" && folio && (
        <>
          <Button
            text={translate("action.takePayment")}
            onPress={() => open("pay")}
            disabled={busy}
            style={$grow}
            testID="stay-pay"
          />
          {can.checkout && (
            <Button
              preset={due > 0 ? "secondary" : "primary"}
              text={translate("action.checkOut")}
              onPress={onCheckOut}
              disabled={busy}
              style={$grow}
              testID="stay-checkout"
            />
          )}
        </>
      )}
      {s === "checked_out" && folio && can.invoice && (
        <Button
          text={translate("stay.invoice")}
          onPress={onInvoice}
          disabled={busy}
          style={$grow}
        />
      )}
    </View>
  )
}

/** The overflow menu items for the booking's state. */
export function stayMenu(
  booking: Booking,
  folio: Folio | null,
  can: Can,
  open: (sheet: StaySheet) => void,
  onInvoice: () => void,
): ActionItem[] {
  const s = booking.state
  const live = s === "reserved" || s === "pending" || s === "checked_in"
  const items: ActionItem[] = []
  if (s === "checked_in" && folio)
    items.push({ label: translate("stay.addExtra"), onPress: () => open("extra") })
  if (live && folio)
    items.push({ label: translate("stay.giveDiscount"), onPress: () => open("discount") })
  if (folio && folio.paidPaise > 0 && (can.refund || can.checkout))
    items.push({ label: translate("stay.refund"), onPress: () => open("refund") })
  if (s === "checked_out" && folio && can.invoice)
    items.push({ label: translate("stay.invoice"), onPress: onInvoice })
  if (live && can.edit) {
    items.push({
      label: translate("stay.editDetails"),
      separator: true,
      onPress: () => open("editDetails"),
    })
    items.push({ label: translate("stay.party"), onPress: () => open("party") })
    items.push({ label: translate("stay.addUnit"), onPress: () => open("addUnit") })
  }
  if ((s === "reserved" || s === "pending") && can.edit) {
    items.push({
      label: translate("action.markNoShow"),
      separator: true,
      onPress: () => open("noShow"),
    })
    items.push({ label: translate("booking.cancel"), danger: true, onPress: () => open("cancel") })
  }
  return items
}

const $row: ViewStyle = { flexDirection: "row", gap: 8 }
const $grow: ViewStyle = { flex: 1 }
