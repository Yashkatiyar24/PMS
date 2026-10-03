import { useState } from "react"

import { Button, ChoiceChips, Input, Sheet, Switch, showError, showToast } from "@/components"
import { translate, translateOr } from "@/i18n/translate"
import { api } from "@/services/api"

import { PRIORITIES, type TicketPriority } from "../types"

export type ReportIssueSheetProps = {
  roomId: string | null
  roomNumber?: string
  onClose: () => void
  onDone?: () => void
}

/** "Report a problem": issue, details, priority, take the room off sale. Used from Rooms and Maintenance. */
export function ReportIssueSheet({ roomId, roomNumber, onClose, onDone }: ReportIssueSheetProps) {
  const [issue, setIssue] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<TicketPriority>("normal")
  const [offSale, setOffSale] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    const r = await api.maintenance.report({
      roomId,
      issue: issue.trim(),
      description: description.trim(),
      priority,
      takesRoomOffSale: !!roomId && offSale,
    })
    setBusy(false)
    if (!r.ok) return showError(r.problem)
    showToast(translate("action.done"), "ok")
    onDone?.()
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={translate("maint.report")}
      description={
        roomNumber ? `${translate("res.col.room")} ${roomNumber}` : translate("maint.noRoom")
      }
      footer={
        <Button
          size="lg"
          text={translate("maint.report")}
          onPress={submit}
          disabled={busy || !issue.trim()}
        />
      }
    >
      <Input
        label={translate("maint.issue")}
        placeholder={translate("maint.issueHint")}
        value={issue}
        onChangeText={setIssue}
        autoFocus
      />
      <Input
        label={translate("common.details")}
        value={description}
        onChangeText={setDescription}
        multiline
      />
      <ChoiceChips
        value={priority}
        onChange={setPriority}
        options={PRIORITIES.map((p) => ({ value: p, label: translateOr(`priority.${p}`, p) }))}
      />
      {!!roomId && (
        <Switch
          value={offSale}
          onValueChange={setOffSale}
          label={translate("maint.offSale")}
          labelPosition="right"
        />
      )}
    </Sheet>
  )
}
