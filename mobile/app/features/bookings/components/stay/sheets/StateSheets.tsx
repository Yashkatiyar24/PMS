import { useState } from "react"

import { Button, Input, PinField, Sheet, Text } from "@/components"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { rupees } from "@/utils/format"

import { useApproval } from "../../../hooks/useApproval"
import type { Approval } from "../../../types"

/** Cancel (with reason) or mark no-show; PIN when the role lacks `reservations.cancel`. */
export function CancelSheet({
  open,
  onClose,
  kind,
  onDone,
}: {
  open: boolean
  onClose: () => void
  kind: "cancel" | "noShow"
  onDone: (reason: string, approval: Approval) => void
}) {
  const approval = useApproval("reservations.cancel")
  const [reason, setReason] = useState("")
  const title = kind === "cancel" ? translate("booking.cancel") : translate("action.markNoShow")
  const ready = approval.ready && (kind === "noShow" || reason.trim().length > 0)
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={kind === "noShow" ? translate("booking.noShowConfirm") : undefined}
      footer={
        <Button
          preset="danger"
          size="lg"
          text={title}
          disabled={!ready}
          onPress={() => onDone(reason.trim(), approval.approval)}
        />
      }
    >
      {kind === "cancel" && (
        <Input
          label={translate("booking.cancelReason")}
          value={reason}
          onChangeText={setReason}
          autoFocus
        />
      )}
      {approval.needsPin && <PinField value={approval.pin} onChangeText={approval.setPin} />}
    </Sheet>
  )
}

/** Check out with an unpaid balance or early: a reason, and a PIN when the role lacks `discount.apply`. */
export function CheckoutOverrideSheet({
  open,
  onClose,
  duePaise,
  onPay,
  onDone,
}: {
  open: boolean
  onClose: () => void
  duePaise: number
  onPay: () => void
  onDone: (reason: string, approval: Approval) => void
}) {
  const { theme } = useAppTheme()
  const approval = useApproval("discount.apply")
  const [reason, setReason] = useState("")
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={translate("action.checkOut")}
      description={duePaise > 0 ? `${translate("stay.balance")}: ${rupees(duePaise)}` : undefined}
      footer={
        <>
          {duePaise > 0 && (
            <Button preset="secondary" text={translate("action.takePayment")} onPress={onPay} />
          )}
          <Button
            preset="danger"
            size="lg"
            text={translate("action.checkOut")}
            disabled={!reason.trim() || !approval.ready}
            onPress={() => onDone(reason.trim(), approval.approval)}
          />
        </>
      }
    >
      <Text text={translate("approval.title")} size="sm" style={{ color: theme.colors.textDim }} />
      <Input
        label={translate("approval.reason")}
        value={reason}
        onChangeText={setReason}
        autoFocus
      />
      {approval.needsPin && <PinField value={approval.pin} onChangeText={approval.setPin} />}
    </Sheet>
  )
}

/** Give back one unit early; PIN when the role lacks `discount.apply`. */
export function ReleaseSheet({
  open,
  onClose,
  unitLabel,
  onDone,
}: {
  open: boolean
  onClose: () => void
  unitLabel: string
  onDone: (approval: Approval) => void
}) {
  const approval = useApproval("discount.apply")
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={translate("stay.releaseUnit")}
      description={unitLabel}
      footer={
        <Button
          preset="danger"
          size="lg"
          text={translate("stay.releaseUnit")}
          disabled={!approval.ready}
          onPress={() => onDone(approval.approval)}
        />
      }
    >
      {approval.needsPin && <PinField value={approval.pin} onChangeText={approval.setPin} />}
    </Sheet>
  )
}
