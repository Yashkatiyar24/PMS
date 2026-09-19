"use client"

/**
 * "Something is broken in this room": a repair ticket in three taps, from wherever the room is open. Taking the
 * room off sale is a choice, because a dripping tap does not stop a guest sleeping there and a broken lock does.
 */
import { useState } from "react"
import { api, ApiError } from "@/lib/api"
import { useI18n } from "@/i18n"
import { Banner, Button, ChoiceChips, Field, Sheet } from "./ui"

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const

export function ReportIssue({ open, onOpenChange, roomId, roomNumber, onDone }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  roomId: string | null
  roomNumber?: string
  onDone?: () => void
}) {
  const { t } = useI18n()
  const [issue, setIssue] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("normal")
  const [offSale, setOffSale] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function submit() {
    setBusy(true)
    setError("")
    try {
      await api("/api/maintenance", { method: "POST", body: { roomId, issue, description, priority, takesRoomOffSale: offSale && !!roomId } })
      setIssue(""); setDescription(""); setPriority("normal"); setOffSale(false)
      onOpenChange(false)
      onDone?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t("maint.report")} description={roomNumber ? `${t("nav.rooms")} ${roomNumber}` : undefined}
      footer={<Button size="lg" className="w-full" disabled={busy || !issue.trim()} onClick={submit}>{t("maint.report")}</Button>}>
      <div className="space-y-3">
        {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}
        <Field label={t("maint.issue")}><input value={issue} onChange={(e) => setIssue(e.target.value)} placeholder={t("maint.issueHint")} autoFocus /></Field>
        <Field label={t("common.details")}><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label={t("rooms.priority")}>
          <ChoiceChips value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) }))} />
        </Field>
        {roomId && (
          <label className="flex gap-3 text-sm">
            <input type="checkbox" checked={offSale} onChange={(e) => setOffSale(e.target.checked)} />
            <span>{t("maint.offSale")}</span>
          </label>
        )}
      </div>
    </Sheet>
  )
}
