import { useState } from "react"

import { Button, ChoiceChips, Input, MoneyInput, PinField, Sheet, Text } from "@/components"
import { CHARGE_CATEGORIES, type PaymentMode } from "@/features/folio/types"
import { translate, translateOr } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { paiseToInput, rupees, toPaise } from "@/utils/format"

import { useApproval } from "../../../hooks/useApproval"

type Done = (body: {
  amountPaise: number
  mode: PaymentMode
  reason: string
  category: string
  description: string
  qty: number
  approverId: string | null
  pin: string | null
}) => void

const MODES: PaymentMode[] = ["cash", "upi", "card", "bank"]
const modeOptions = (modes: string[]) =>
  modes.map((m) => ({
    value: m as PaymentMode,
    label: translateOr(`option.${m}`, m.toUpperCase()),
  }))

/** Take payment: amount + mode. */
export function PaySheet({
  open,
  onClose,
  duePaise,
  modes,
  onDone,
}: {
  open: boolean
  onClose: () => void
  duePaise: number
  modes: string[]
  onDone: Done
}) {
  const [amount, setAmount] = useState(paiseToInput(Math.max(0, duePaise)))
  const [mode, setMode] = useState<PaymentMode>((modes[0] as PaymentMode) ?? "cash")
  const paise = toPaise(amount)
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={translate("action.takePayment")}
      description={`${translate("stay.balance")}: ${rupees(duePaise)}`}
      footer={
        <Button
          size="lg"
          text={translate("action.takePayment")}
          disabled={paise <= 0}
          testID="pay-submit"
          onPress={() =>
            onDone({
              amountPaise: paise,
              mode,
              reason: "",
              category: "",
              description: "",
              qty: 1,
              approverId: null,
              pin: null,
            })
          }
        />
      }
    >
      <MoneyInput
        label={translate("stay.payment")}
        value={amount}
        onChangeText={setAmount}
        autoFocus
      />
      <ChoiceChips
        value={mode}
        onChange={setMode}
        options={modeOptions(modes.length ? modes : MODES)}
      />
    </Sheet>
  )
}

/** Add an extra charge: category, details, qty, price. */
export function ExtraSheet({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone: Done
}) {
  const [category, setCategory] = useState<string>("food")
  const [description, setDescription] = useState("")
  const [qty, setQty] = useState("1")
  const [amount, setAmount] = useState("")
  const paise = toPaise(amount)
  const n = Math.max(1, parseInt(qty || "1", 10) || 1)
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={translate("stay.addExtra")}
      footer={
        <Button
          size="lg"
          text={translate("action.add")}
          disabled={!description.trim() || paise <= 0}
          testID="extra-submit"
          onPress={() =>
            onDone({
              amountPaise: paise,
              mode: "cash",
              reason: "",
              category,
              description: description.trim(),
              qty: n,
              approverId: null,
              pin: null,
            })
          }
        />
      }
    >
      <ChoiceChips
        value={category}
        onChange={setCategory}
        options={CHARGE_CATEGORIES.map((c) => ({
          value: c,
          label: translateOr(`category.${c}`, c.replace(/_/g, " ")),
        }))}
      />
      <Input
        label={translate("common.details")}
        value={description}
        onChangeText={setDescription}
        autoFocus
        testID="extra-details"
      />
      <Input
        label={translate("stay.qty")}
        value={qty}
        onChangeText={(t) => setQty(t.replace(/\D/g, ""))}
        keyboardType="number-pad"
      />
      <MoneyInput
        label={translate("stay.total")}
        value={amount}
        onChangeText={setAmount}
        testID="extra-amount"
      />
    </Sheet>
  )
}

/** A discount, refund or credit note: amount, reason, and a PIN when the role lacks the permission. */
export function ApprovedMoneySheet({
  open,
  onClose,
  kind,
  maxPaise,
  modes,
  onDone,
}: {
  open: boolean
  onClose: () => void
  kind: "discount" | "refund" | "creditNote"
  maxPaise?: number
  modes?: string[]
  onDone: Done
}) {
  const { theme } = useAppTheme()
  const permission =
    kind === "discount" ? "discount.apply" : kind === "refund" ? "refund" : "invoice.edit"
  const approval = useApproval(permission)
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [mode, setMode] = useState<PaymentMode>((modes?.[0] as PaymentMode) ?? "cash")
  const paise = toPaise(amount)
  const title =
    kind === "discount"
      ? translate("stay.giveDiscount")
      : kind === "refund"
        ? translate("stay.refund")
        : translate("stay.creditNote")
  const overMax = maxPaise !== undefined && paise > maxPaise
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={
        maxPaise !== undefined
          ? translate("stay.refundHint", { amount: rupees(maxPaise) })
          : undefined
      }
      footer={
        <Button
          size="lg"
          text={title}
          disabled={paise <= 0 || overMax || !reason.trim() || !approval.ready}
          testID="money-submit"
          onPress={() =>
            onDone({
              amountPaise: paise,
              mode,
              reason: reason.trim(),
              category: "",
              description: "",
              qty: 1,
              ...approval.approval,
            })
          }
        />
      }
    >
      <MoneyInput
        label={translate("stay.total")}
        value={amount}
        onChangeText={setAmount}
        autoFocus
        testID="money-amount"
        error={
          overMax ? translate("stay.refundHint", { amount: rupees(maxPaise ?? 0) }) : undefined
        }
      />
      {kind === "refund" && (
        <ChoiceChips
          value={mode}
          onChange={setMode}
          options={modeOptions(modes?.length ? modes : MODES)}
        />
      )}
      <Input
        label={translate("common.reason")}
        value={reason}
        onChangeText={setReason}
        testID="money-reason"
      />
      {!!approval.needsPin && <PinField value={approval.pin} onChangeText={approval.setPin} />}
      {!!approval.needsPin && (
        <Text
          text={translate("approval.title")}
          size="xs"
          style={{ color: theme.colors.textDim }}
        />
      )}
    </Sheet>
  )
}
