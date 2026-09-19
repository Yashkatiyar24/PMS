"use client"

/**
 * Repairs. Open tickets first, the urgent ones on top; a tap opens one to assign it, move it along or resolve
 * it. Anyone on the floor can report a problem; only the maintenance role (and managers) work the tickets.
 */
import { useState } from "react"
import { Plus, Wrench } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { useAutoRefresh, useResource } from "@/lib/use-resource"
import { formatDateTime } from "@/lib/format"
import type { Room } from "@/lib/types"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { Avatar, Banner, Button, Chip, ChoiceChips, Empty, Field, ListCard, ListRow, Loading, PageHeader, Segmented, Sheet, type Tone } from "@/components/ui"
import { PRIORITIES, ReportIssue } from "@/components/ReportIssue"

type Ticket = {
  id: string; roomId: string | null; roomNumber: string | null; issue: string; description: string; priority: (typeof PRIORITIES)[number]
  status: "open" | "assigned" | "in_progress" | "resolved" | "closed"; assignedTo: string | null; assignedName: string | null; resolution: string | null
  takesRoomOffSale: boolean; reportedByName: string | null; createdAt: string; resolvedAt: string | null
}
type Person = { id: string; name: string }
const STATUSES = ["open", "assigned", "in_progress", "resolved", "closed"] as const
const PRIORITY_TONE: Record<Ticket["priority"], Tone> = { low: "neutral", normal: "info", high: "warn", urgent: "danger" }
const STATUS_TONE: Record<Ticket["status"], Tone> = { open: "danger", assigned: "warn", in_progress: "info", resolved: "ok", closed: "neutral" }

export default function MaintenancePage() {
  const { t } = useI18n()
  const { has } = useSession()
  const works = has("maintenance")
  const [showDone, setShowDone] = useState(false)
  const { data, error: loadError, reload } = useResource(
    async () => {
      const [tickets, rooms, people] = await Promise.all([
        api<Ticket[]>(`/api/maintenance?all=${showDone}`),
        api<Room[]>("/api/rooms"),
        works ? api<Person[]>("/api/maintenance/technicians") : Promise.resolve([] as Person[]),
      ])
      return { tickets, rooms, people }
    },
    [showDone, works],
    t("error.generic"),
  )
  useAutoRefresh(reload)
  const [openId, setOpenId] = useState<string | null>(null)
  const [edit, setEdit] = useState<{ status: Ticket["status"]; assignedTo: string; priority: Ticket["priority"]; resolution: string } | null>(null)
  const [reporting, setReporting] = useState(false)
  const [reportRoom, setReportRoom] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  if (!data) return loadError ? <Banner tone="danger">{loadError}</Banner> : <Loading />

  const open = data.tickets.find((x) => x.id === openId) ?? null
  const status = (s: Ticket["status"]) => t(`maint.status.${s}` as "maint.status.open")

  async function save() {
    if (!open || !edit) return
    setBusy(true)
    setError("")
    try {
      await api(`/api/maintenance/${open.id}`, { method: "PATCH", body: { status: edit.status, assignedTo: edit.assignedTo || null, priority: edit.priority, resolution: edit.resolution } })
      setOpenId(null)
      setEdit(null)
      reload()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("maint.title")}
        subtitle={`${data.tickets.filter((x) => !["resolved", "closed"].includes(x.status)).length} ${t("maint.openCount")}`}
        back="/settings"
        actions={has("maintenance.report") ? <Button size="sm" onClick={() => setReporting(true)}><Plus size={16} aria-hidden /> {t("maint.report")}</Button> : undefined}
      />
      {error && !open && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}

      <Segmented value={showDone ? "all" : "open"} onChange={(v) => setShowDone(v === "all")}
        items={[{ value: "open", label: t("maint.status.open") }, { value: "all", label: t("common.all") }]} />

      {data.tickets.length === 0 ? <Empty icon={Wrench} /> : (
        <ListCard>
          {data.tickets.map((x) => (
            <ListRow
              key={x.id}
              onClick={() => { setOpenId(x.id); setEdit(null); setError("") }}
              leading={<Avatar icon={Wrench} tone={PRIORITY_TONE[x.priority]} size={38} />}
              title={`${x.roomNumber ? `${x.roomNumber} · ` : ""}${x.issue}`}
              subtitle={`${formatDateTime(x.createdAt)}${x.assignedName ? ` · ${x.assignedName}` : ""}`}
              right={<Chip tone={STATUS_TONE[x.status]} dot>{status(x.status)}</Chip>}
            />
          ))}
        </ListCard>
      )}

      <Sheet open={!!open} onOpenChange={(o) => { if (!o) { setOpenId(null); setEdit(null) } }} title={open?.issue ?? ""}
        description={open ? [open.roomNumber && `${t("nav.rooms")} ${open.roomNumber}`, open.reportedByName && t("res.by", { name: open.reportedByName })].filter(Boolean).join(" · ") : undefined}
        footer={works && open ? <Button size="lg" className="w-full" disabled={busy || !edit} onClick={save}>{t("action.save")}</Button> : undefined}>
        {open && (() => {
          const e = edit ?? { status: open.status, assignedTo: open.assignedTo ?? "", priority: open.priority, resolution: open.resolution ?? "" }
          return (
            <div className="space-y-3">
              {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}
              <div className="flex flex-wrap gap-2">
                <Chip tone={STATUS_TONE[open.status]} dot>{status(open.status)}</Chip>
                <Chip tone={PRIORITY_TONE[open.priority]}>{t(`priority.${open.priority}`)}</Chip>
                {open.takesRoomOffSale && <Chip tone="danger">{t("rooms.status.maintenance")}</Chip>}
              </div>
              {open.description && <p className="text-sm text-ink-soft">{open.description}</p>}
              {works ? (
                <>
                  <Field label={t("dash.col.status")}>
                    <ChoiceChips value={e.status} onChange={(v) => setEdit({ ...e, status: v })} options={STATUSES.map((s) => ({ value: s, label: status(s) }))} />
                  </Field>
                  <Field label={t("maint.assignee")}>
                    <select value={e.assignedTo} onChange={(ev) => setEdit({ ...e, assignedTo: ev.target.value })}>
                      <option value="">{t("rooms.unassigned")}</option>
                      {data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </Field>
                  <Field label={t("rooms.priority")}>
                    <ChoiceChips value={e.priority} onChange={(v) => setEdit({ ...e, priority: v })} options={PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) }))} />
                  </Field>
                  <Field label={t("maint.resolution")} hint={t("maint.resolutionHint")}>
                    <textarea rows={2} value={e.resolution} onChange={(ev) => setEdit({ ...e, resolution: ev.target.value })} />
                  </Field>
                </>
              ) : open.resolution && <p className="text-sm"><b>{t("maint.resolution")}:</b> {open.resolution}</p>}
            </div>
          )
        })()}
      </Sheet>

      <Sheet open={reporting && !reportRoom} onOpenChange={setReporting} title={t("maint.report")}
        footer={<Button size="lg" className="w-full" onClick={() => setReportRoom("none")}>{t("action.next")}</Button>}>
        <Field label={t("nav.rooms")}>
          <select value="" onChange={(e) => setReportRoom(e.target.value || "none")}>
            <option value="">{t("maint.noRoom")}</option>
            {data.rooms.map((r) => <option key={r.id} value={r.id}>{r.number}</option>)}
          </select>
        </Field>
      </Sheet>
      <ReportIssue
        open={reporting && !!reportRoom}
        onOpenChange={(o) => { if (!o) { setReporting(false); setReportRoom("") } }}
        roomId={reportRoom && reportRoom !== "none" ? reportRoom : null}
        roomNumber={data.rooms.find((r) => r.id === reportRoom)?.number}
        onDone={reload}
      />
    </div>
  )
}
