import { useState } from "react"

import { Button, ChoiceChips, DateField, Input, MoneyInput, Sheet, showError } from "@/components"
import { IdPhotoField } from "@/features/guests/components/IdPhotoField"
import { translate, translateOr } from "@/i18n/translate"
import { api } from "@/services/api"
import { today } from "@/utils/date"
import { toPaise } from "@/utils/format"
import type { PickedFile } from "@/utils/image"

import { EXPENSE_CATEGORIES, EXPENSE_MODES, type Expense, type ExpenseCategory } from "../types"

/** Add an expense: amount, date, category, vendor, mode, details, optional bill photo (compressed to 400 KB). */
export function ExpenseSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("")
  const [spentOn, setSpentOn] = useState(today())
  const [category, setCategory] = useState<ExpenseCategory>("supplies")
  const [vendor, setVendor] = useState("")
  const [mode, setMode] = useState<string>("cash")
  const [description, setDescription] = useState("")
  const [bill, setBill] = useState<PickedFile | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    const r = await api.operations.addExpense({
      spentOn,
      category,
      amountPaise: toPaise(amount),
      vendor: vendor.trim(),
      paymentMode: mode,
      description: description.trim(),
    })
    if (r.ok && bill)
      await api.operations.uploadExpenseReceipt(r.data.id, { ...bill, name: "bill.jpg" })
    setBusy(false)
    if (!r.ok) return showError(r.problem)
    onDone()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={translate("expense.add")}
      footer={
        <Button
          size="lg"
          text={translate("action.add")}
          onPress={submit}
          disabled={busy || toPaise(amount) <= 0}
        />
      }
    >
      <MoneyInput
        label={translate("stay.total")}
        value={amount}
        onChangeText={setAmount}
        autoFocus
      />
      <DateField
        label={translate("booking.dates")}
        value={spentOn}
        max={today()}
        onChange={setSpentOn}
      />
      <ChoiceChips
        value={category}
        onChange={setCategory}
        options={EXPENSE_CATEGORIES.map((c) => ({
          value: c,
          label: translateOr(`expense.${c}`, c),
        }))}
      />
      <Input label={translate("expense.vendor")} value={vendor} onChangeText={setVendor} />
      <ChoiceChips
        value={mode}
        onChange={setMode}
        options={EXPENSE_MODES.map((m) => ({
          value: m,
          label: translateOr(`option.${m}`, m.toUpperCase()),
        }))}
      />
      <Input
        label={translate("common.details")}
        value={description}
        onChangeText={setDescription}
      />
      <IdPhotoField
        photo={bill}
        onPhoto={setBill}
        maxKb={400}
        label={translate("expense.attachBill")}
      />
    </Sheet>
  )
}

/** Void an expense with a reason. */
export function VoidExpenseSheet({
  expense,
  onClose,
  onDone,
}: {
  expense: Expense
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState("")
  const submit = async () => {
    const r = await api.operations.voidExpense(expense.id, reason.trim())
    if (!r.ok) return showError(r.problem)
    onDone()
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={translate("expense.void")}
      description={expense.vendor || expense.description}
      footer={
        <Button
          preset="danger"
          size="lg"
          text={translate("expense.void")}
          onPress={submit}
          disabled={!reason.trim()}
        />
      }
    >
      <Input label={translate("common.reason")} value={reason} onChangeText={setReason} autoFocus />
    </Sheet>
  )
}
