"use client"

/**
 * Supplies and linen. Each item shows what is on the shelf (and, for linen, what is out at the laundry), and
 * flags itself when it falls to its low-stock line. A tap records stock in, used, sent to the laundry or back;
 * stock is the sum of those, never a number typed over.
 */
import { useState } from "react"
import { AlertTriangle, Boxes, Plus } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { useResource } from "@/lib/use-resource"
import { formatDateTime } from "@/lib/format"
import type { Room } from "@/lib/types"
import { useI18n } from "@/i18n"
import { Avatar, Banner, Button, Chip, ChoiceChips, Empty, Field, ListCard, ListRow, Loading, PageHeader, SectionLabel, Segmented, Sheet } from "@/components/ui"

const CATEGORIES = ["cleaning", "linen", "toiletries", "food", "maintenance", "stationery"] as const
type Item = { id: string; name: string; category: (typeof CATEGORIES)[number]; unit: string; lowStockThreshold: number; active: boolean; onHand: number; atLaundry: number; low: boolean }
type Movement = { id: string; kind: string; qtyChange: number; roomNumber: string | null; note: string; byName: string | null; at: string }
type Kind = "purchase" | "consumption" | "to_laundry" | "from_laundry" | "adjustment" | "opening"

const n = (v: number) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })

export default function InventoryPage() {
  const { t } = useI18n()
  const { data, error: loadError, reload } = useResource(
    async () => {
      const [items, rooms] = await Promise.all([api<Item[]>("/api/inventory/items"), api<Room[]>("/api/rooms").catch(() => [] as Room[])])
      return { items, rooms }
    },
    [],
    t("error.generic"),
  )
  const [filter, setFilter] = useState<"all" | "low">("all")
  const [editing, setEditing] = useState<Partial<Item> | null>(null)
  const [moving, setMoving] = useState<Item | null>(null)
  const [kind, setKind] = useState<Kind>("purchase")
  const [qty, setQty] = useState("")
  const [cost, setCost] = useState("")
  const [roomId, setRoomId] = useState("")
  const [note, setNote] = useState("")
  const [history, setHistory] = useState<Movement[] | null>(null)
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
  const lowCount = data.items.filter((i) => i.low).length
  const shown = filter === "low" ? data.items.filter((i) => i.low) : data.items
  const cat = (c: string) => t(`stock.cat.${c}` as "stock.cat.linen")
  const kinds: Kind[] = moving?.category === "linen" ? ["purchase", "consumption", "to_laundry", "from_laundry", "adjustment", "opening"] : ["purchase", "consumption", "adjustment", "opening"]

  const saveItem = () =>
    run(async () => {
      if (!editing) return
      const body = { name: editing.name, category: editing.category ?? "cleaning", unit: editing.unit ?? "pcs", lowStockThreshold: editing.lowStockThreshold ?? 0, active: editing.active ?? true }
      if (editing.id) await api(`/api/inventory/items/${editing.id}`, { method: "PUT", body })
      else await api("/api/inventory/items", { method: "POST", body })
      setEditing(null)
    })

  const saveMove = () =>
    run(async () => {
      if (!moving) return
      await api(`/api/inventory/items/${moving.id}/movements`, {
        method: "POST",
        body: { kind, qty: Number(qty), unitCostPaise: kind === "purchase" && cost ? Math.round(Number(cost) * 100) : null, roomId: roomId || null, note },
      })
      setMoving(null)
    })

  function openItem(item: Item) {
    setMoving(item); setKind("purchase"); setQty(""); setCost(""); setRoomId(""); setNote(""); setHistory(null)
    api<Movement[]>(`/api/inventory/items/${item.id}/movements`).then(setHistory).catch(() => setHistory([]))
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t("stock.title")} subtitle={lowCount > 0 ? t("stock.lowCount", { n: lowCount }) : undefined} back="/settings"
        actions={<Button size="sm" onClick={() => setEditing({ category: "cleaning", unit: "pcs", lowStockThreshold: 0 })}><Plus size={16} aria-hidden /> {t("action.add")}</Button>} />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}

      <Segmented value={filter} onChange={setFilter} items={[
        { value: "all", label: t("common.all"), count: data.items.length, tone: "brand" },
        { value: "low", label: t("stock.low"), count: lowCount, tone: "danger" },
      ]} />

      {shown.length === 0 ? <Empty icon={Boxes} /> : CATEGORIES.filter((c) => shown.some((i) => i.category === c)).map((c) => (
        <section key={c}>
          <SectionLabel>{cat(c)}</SectionLabel>
          <ListCard>
            {shown.filter((i) => i.category === c).map((item) => (
              <ListRow key={item.id} onClick={() => openItem(item)}
                leading={<Avatar icon={item.low ? AlertTriangle : Boxes} tone={item.low ? "danger" : item.active ? "teal" : "neutral"} size={38} />}
                title={<span className={item.active ? "" : "line-through opacity-60"}>{item.name}</span>}
                subtitle={item.category === "linen" && Number(item.atLaundry) > 0 ? t("stock.atLaundry", { n: n(item.atLaundry) }) : item.lowStockThreshold > 0 ? t("stock.lowLine", { n: n(item.lowStockThreshold) }) : undefined}
                right={<Chip tone={item.low ? "danger" : "ok"}>{n(item.onHand)} {item.unit}</Chip>} />
            ))}
          </ListCard>
        </section>
      ))}

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing?.id ? t("stock.editItem") : t("stock.addItem")}
        footer={<Button size="lg" className="w-full" disabled={busy || !editing?.name?.trim()} onClick={saveItem}>{t("action.save")}</Button>}>
        {editing && (
          <div className="space-y-3">
            <Field label={t("setup.name")}><input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus /></Field>
            <Field label={t("stay.category")}>
              <ChoiceChips value={editing.category ?? "cleaning"} onChange={(v) => setEditing({ ...editing, category: v })} options={CATEGORIES.map((c) => ({ value: c, label: cat(c) }))} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("stock.unit")}><input value={editing.unit ?? ""} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} placeholder="pcs, kg, litre" /></Field>
              <Field label={t("stock.lowLineLabel")}><input type="number" min={0} value={editing.lowStockThreshold ?? 0} onChange={(e) => setEditing({ ...editing, lowStockThreshold: Number(e.target.value) })} /></Field>
            </div>
            {editing.id && (
              <label className="flex gap-3 text-sm">
                <input type="checkbox" checked={editing.active ?? true} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                <span>{t("stock.inUse")}</span>
              </label>
            )}
          </div>
        )}
      </Sheet>

      <Sheet wide open={!!moving} onOpenChange={(o) => !o && setMoving(null)} title={moving?.name ?? ""}
        description={moving ? `${n(moving.onHand)} ${moving.unit}${moving.category === "linen" && Number(moving.atLaundry) > 0 ? ` · ${t("stock.atLaundry", { n: n(moving.atLaundry) })}` : ""}` : undefined}
        footer={<Button size="lg" className="w-full" disabled={busy || !qty || Number(qty) === 0} onClick={saveMove}>{t("action.save")}</Button>}>
        {moving && (
          <div className="space-y-3">
            <ChoiceChips value={kind} onChange={setKind} options={kinds.map((k) => ({ value: k, label: t(`stock.kind.${k}`) }))} />
            <div className="grid grid-cols-2 gap-2">
              <Field label={`${t("stay.qty")} (${moving.unit})`} hint={kind === "adjustment" ? t("stock.adjustHint") : undefined}>
                <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
              </Field>
              {kind === "purchase" && <Field label={t("stock.unitCost")}><input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="₹" /></Field>}
              {kind === "consumption" && (
                <Field label={t("nav.rooms")}>
                  <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                    <option value="">—</option>
                    {data.rooms.map((r) => <option key={r.id} value={r.id}>{r.number}</option>)}
                  </select>
                </Field>
              )}
            </div>
            <Field label={t("rooms.note")}><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setEditing(moving); setMoving(null) }}>{t("stock.editItem")}</Button>
            </div>
            <SectionLabel>{t("stock.history")}</SectionLabel>
            {history === null ? <Loading rows={1} /> : history.length === 0 ? <Empty /> : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line text-sm">
                {history.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block font-semibold">{t(`stock.kind.${m.kind}` as "stock.kind.purchase")}{m.roomNumber && ` · ${m.roomNumber}`}</span>
                      <span className="block truncate text-xs text-ink-soft">{formatDateTime(m.at)}{m.byName && ` · ${m.byName}`}{m.note && ` · ${m.note}`}</span>
                    </span>
                    <b className={`tabular-nums ${Number(m.qtyChange) < 0 ? "text-danger" : "text-ok"}`}>{Number(m.qtyChange) > 0 ? "+" : ""}{n(m.qtyChange)}</b>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}
