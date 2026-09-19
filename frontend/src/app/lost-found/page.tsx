"use client"

/** What guests left behind: logged when found, and marked returned (to whom) or disposed of. */
import { useState } from "react"
import { PackageSearch, Plus } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { useResource } from "@/lib/use-resource"
import { formatDate } from "@/lib/format"
import type { Room } from "@/lib/types"
import { useI18n } from "@/i18n"
import { Avatar, Banner, Button, Chip, ChoiceChips, Empty, Field, ListCard, ListRow, Loading, PageHeader, Sheet, type Tone } from "@/components/ui"

type Item = { id: string; roomId: string | null; roomNumber: string | null; description: string; foundAt: string; foundByName: string | null; status: "held" | "returned" | "disposed"; returnedTo: string | null; notes: string }
const TONE: Record<Item["status"], Tone> = { held: "warn", returned: "ok", disposed: "neutral" }

export default function LostFoundPage() {
  const { t } = useI18n()
  const { data, error: loadError, reload } = useResource(
    async () => {
      const [items, rooms] = await Promise.all([api<Item[]>("/api/lost-found"), api<Room[]>("/api/rooms")])
      return { items, rooms }
    },
    [],
    t("error.generic"),
  )
  const [adding, setAdding] = useState(false)
  const [roomId, setRoomId] = useState("")
  const [description, setDescription] = useState("")
  const [notes, setNotes] = useState("")
  const [openItem, setOpenItem] = useState<Item | null>(null)
  const [status, setStatus] = useState<Item["status"]>("held")
  const [returnedTo, setReturnedTo] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError("")
    try {
      await action()
      reload()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
    } finally {
      setBusy(false)
    }
  }

  if (!data) return loadError ? <Banner tone="danger">{loadError}</Banner> : <Loading />
  const label = (s: Item["status"]) => t(`lost.status.${s}` as "lost.status.held")

  return (
    <div className="space-y-4">
      <PageHeader title={t("lost.title")} subtitle={`${data.items.filter((i) => i.status === "held").length} ${label("held")}`} back="/settings"
        actions={<Button size="sm" onClick={() => setAdding(true)}><Plus size={16} aria-hidden /> {t("action.add")}</Button>} />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}

      {data.items.length === 0 ? <Empty icon={PackageSearch} /> : (
        <ListCard>
          {data.items.map((item) => (
            <ListRow
              key={item.id}
              onClick={() => { setOpenItem(item); setStatus(item.status); setReturnedTo(item.returnedTo ?? "") }}
              leading={<Avatar icon={PackageSearch} tone={TONE[item.status]} size={38} />}
              title={item.description}
              subtitle={[item.roomNumber, formatDate(item.foundAt), item.foundByName].filter(Boolean).join(" · ")}
              right={<Chip tone={TONE[item.status]} dot>{label(item.status)}</Chip>}
            />
          ))}
        </ListCard>
      )}

      <Sheet open={adding} onOpenChange={setAdding} title={t("lost.add")}
        footer={<Button size="lg" className="w-full" disabled={busy || !description.trim()}
          onClick={() => run(async () => { await api("/api/lost-found", { method: "POST", body: { roomId: roomId || null, description, notes } }); setAdding(false); setDescription(""); setNotes(""); setRoomId("") })}>{t("action.save")}</Button>}>
        <div className="space-y-3">
          <Field label={t("lost.what")}><input value={description} onChange={(e) => setDescription(e.target.value)} autoFocus /></Field>
          <Field label={t("nav.rooms")}>
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">—</option>
              {data.rooms.map((r) => <option key={r.id} value={r.id}>{r.number}</option>)}
            </select>
          </Field>
          <Field label={t("rooms.note")}><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
      </Sheet>

      <Sheet open={!!openItem} onOpenChange={(o) => !o && setOpenItem(null)} title={openItem?.description ?? ""}
        description={openItem ? [openItem.roomNumber, formatDate(openItem.foundAt)].filter(Boolean).join(" · ") : undefined}
        footer={<Button size="lg" className="w-full" disabled={busy || (status === "returned" && !returnedTo.trim())}
          onClick={() => openItem && run(async () => { await api(`/api/lost-found/${openItem.id}`, { method: "PATCH", body: { status, returnedTo, notes: null } }); setOpenItem(null) })}>{t("action.save")}</Button>}>
        <div className="space-y-3">
          {openItem?.notes && <p className="text-sm text-ink-soft">{openItem.notes}</p>}
          <ChoiceChips value={status} onChange={setStatus} options={(["held", "returned", "disposed"] as const).map((s) => ({ value: s, label: label(s) }))} />
          {status === "returned" && <Field label={t("lost.returnedTo")}><input value={returnedTo} onChange={(e) => setReturnedTo(e.target.value)} /></Field>}
        </div>
      </Sheet>
    </div>
  )
}
