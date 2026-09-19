"use client"

/**
 * A light restaurant: open orders, and the menu. An order is for a guest's room (it goes on their bill when
 * posted) or for a table (paid at the counter with a numbered bill). Not a POS: no kitchen screens, no tables map.
 */
import { useState } from "react"
import { BedDouble, Minus, Plus, Printer, UtensilsCrossed, XCircle } from "lucide-react"
import { api, API_BASE, ApiError } from "@/lib/api"
import { useAutoRefresh, useResource } from "@/lib/use-resource"
import { formatTime, rupees, toPaise, unitName } from "@/lib/format"
import type { Today } from "@/lib/types"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { Avatar, Banner, Button, Chip, ChoiceChips, Empty, Field, ListCard, ListRow, Loading, PageHeader, Segmented, Sheet, type Tone } from "@/components/ui"

type MenuItem = { id: string; name: string; category: string; pricePaise: number; active: boolean; sortOrder: number }
type Line = { id?: string; menuItemId: string | null; name: string; qty: number; unitPaise: number }
type Order = {
  id: string; bookingId: string | null; guestName: string | null; units: string | null; tableLabel: string; status: "open" | "posted" | "paid" | "cancelled"
  taxablePaise: number; taxRateBp: number; totalPaise: number; billNumber: string | null; createdAt: string; lines: Line[]
}
const STATUS_TONE: Record<Order["status"], Tone> = { open: "warn", posted: "brand", paid: "ok", cancelled: "neutral" }
const MODES = ["cash", "upi", "card"] as const

export default function RestaurantPage() {
  const { t } = useI18n()
  const { can, has } = useSession()
  const [tab, setTab] = useState<"orders" | "menu">("orders")
  const [showAll, setShowAll] = useState(false)
  const { data, error: loadError, reload } = useResource(
    async () => {
      const [orders, menu, today] = await Promise.all([
        api<Order[]>(`/api/restaurant/orders?all=${showAll}`),
        api<MenuItem[]>("/api/restaurant/menu"),
        has("reservations.view") ? api<Today>("/api/bookings/today") : Promise.resolve(null),
      ])
      return { orders, menu, inHouse: today?.inHouse ?? [] }
    },
    [showAll],
    t("error.generic"),
  )
  useAutoRefresh(reload)
  const [editing, setEditing] = useState<{ id: string | null; bookingId: string; tableLabel: string; lines: Line[] } | null>(null)
  const [custom, setCustom] = useState({ name: "", price: "" })
  const [settling, setSettling] = useState<Order | null>(null)
  const [mode, setMode] = useState<string>("cash")
  const [postTo, setPostTo] = useState("")
  const [cancelReason, setCancelReason] = useState("")
  const [dish, setDish] = useState<Partial<MenuItem> | null>(null)
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

  const activeMenu = data.menu.filter((m) => m.active)
  const add = (m: MenuItem) => editing && setEditing({
    ...editing,
    lines: editing.lines.some((l) => l.menuItemId === m.id)
      ? editing.lines.map((l) => (l.menuItemId === m.id ? { ...l, qty: l.qty + 1 } : l))
      : [...editing.lines, { menuItemId: m.id, name: m.name, qty: 1, unitPaise: m.pricePaise }],
  })
  const bump = (i: number, d: number) => editing && setEditing({ ...editing, lines: editing.lines.map((l, j) => (j === i ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0) })
  const subtotal = (lines: Line[]) => lines.reduce((s, l) => s + l.qty * l.unitPaise, 0)
  const payload = (lines: Line[]) => lines.map((l) => ({ menuItemId: l.menuItemId, name: l.menuItemId ? null : l.name, unitPaise: l.menuItemId ? null : l.unitPaise, qty: l.qty }))

  const saveOrder = () =>
    run(async () => {
      if (!editing) return
      if (editing.id) await api(`/api/restaurant/orders/${editing.id}/lines`, { method: "PUT", body: { lines: payload(editing.lines) } })
      else await api("/api/restaurant/orders", { method: "POST", body: { bookingId: editing.bookingId || null, tableLabel: editing.tableLabel, lines: payload(editing.lines) } })
      setEditing(null)
    })

  const guestLabel = (id: string) => {
    const b = data.inHouse.find((x) => x.id === id)
    return b ? `${b.units.map((u) => unitName(u.roomNumber, u.bedLabel)).join(", ")} · ${b.guestName}` : ""
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t("pos.title")} back="/settings"
        actions={tab === "orders"
          ? <Button size="sm" onClick={() => setEditing({ id: null, bookingId: "", tableLabel: "", lines: [] })}><Plus size={16} aria-hidden /> {t("pos.newOrder")}</Button>
          : can("MANAGER") ? <Button size="sm" onClick={() => setDish({ name: "", category: "", pricePaise: 0 })}><Plus size={16} aria-hidden /> {t("action.add")}</Button> : undefined} />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}

      <Segmented value={tab} onChange={setTab} items={[
        { value: "orders", label: t("pos.orders"), count: data.orders.filter((o) => o.status === "open").length, tone: "warn" },
        { value: "menu", label: t("pos.menu"), count: activeMenu.length, tone: "brand" },
      ]} />

      {tab === "orders" ? (
        <>
          <label className="flex min-h-[44px] items-center gap-3 text-sm">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            <span>{t("pos.showSettled")}</span>
          </label>
          {data.orders.length === 0 ? <Empty icon={UtensilsCrossed} /> : (
            <ListCard>
              {data.orders.map((o) => (
                <ListRow key={o.id}
                  onClick={o.status === "open" ? () => { setSettling(o); setPostTo(o.bookingId ?? ""); setCancelReason("") } : undefined}
                  leading={<Avatar icon={o.bookingId ? BedDouble : UtensilsCrossed} tone={STATUS_TONE[o.status]} size={38} />}
                  title={o.bookingId ? `${o.units ?? ""} · ${o.guestName ?? ""}` : o.tableLabel || t("pos.counter")}
                  subtitle={`${formatTime(o.createdAt)} · ${o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}`}
                  right={
                    <span className="flex items-center gap-1.5">
                      {o.status !== "open" && o.status !== "cancelled" && (
                        <a href={`${API_BASE}/api/restaurant/orders/${o.id}/bill`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-ink-soft hover:bg-surface-2" aria-label={t("action.print")}><Printer size={18} aria-hidden /></a>
                      )}
                      <Chip tone={STATUS_TONE[o.status]}>{o.status === "open" ? rupees(o.totalPaise) : t(`pos.status.${o.status}`)}</Chip>
                    </span>
                  } />
              ))}
            </ListCard>
          )}
        </>
      ) : activeMenu.length === 0 && data.menu.length === 0 ? <Empty icon={UtensilsCrossed} /> : (
        <ListCard>
          {data.menu.map((m) => (
            <ListRow key={m.id} onClick={can("MANAGER") ? () => setDish(m) : undefined} title={<span className={m.active ? "" : "line-through opacity-60"}>{m.name}</span>}
              subtitle={m.category || undefined} right={<Chip tone="neutral">{rupees(m.pricePaise)}</Chip>} />
          ))}
        </ListCard>
      )}

      {/* New order, or changing an open one. */}
      <Sheet wide open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing?.id ? t("pos.editOrder") : t("pos.newOrder")}
        footer={<Button size="lg" className="w-full" disabled={busy || !editing?.lines.length} onClick={saveOrder}>{t("action.save")} · {rupees(subtotal(editing?.lines ?? []))}</Button>}>
        {editing && (
          <div className="space-y-3">
            {!editing.id && (
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label={t("pos.forRoom")}>
                  <select value={editing.bookingId} onChange={(e) => setEditing({ ...editing, bookingId: e.target.value })}>
                    <option value="">{t("pos.counter")}</option>
                    {data.inHouse.map((b) => <option key={b.id} value={b.id}>{guestLabel(b.id)}</option>)}
                  </select>
                </Field>
                {!editing.bookingId && <Field label={t("pos.table")}><input value={editing.tableLabel} onChange={(e) => setEditing({ ...editing, tableLabel: e.target.value })} /></Field>}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {activeMenu.map((m) => (
                <button key={m.id} type="button" onClick={() => add(m)} className="min-h-[44px] rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold hover:bg-surface-2">
                  {m.name} <span className="text-ink-soft">{rupees(m.pricePaise)}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-[1fr_110px_auto] items-end gap-2">
              <Field label={t("pos.offMenu")}><input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} /></Field>
              <Field label="₹"><input inputMode="decimal" value={custom.price} onChange={(e) => setCustom({ ...custom, price: e.target.value })} /></Field>
              <Button variant="secondary" disabled={!custom.name.trim() || toPaise(custom.price) <= 0}
                onClick={() => { setEditing({ ...editing, lines: [...editing.lines, { menuItemId: null, name: custom.name.trim(), qty: 1, unitPaise: toPaise(custom.price) }] }); setCustom({ name: "", price: "" }) }}>
                <Plus size={16} aria-hidden />
              </Button>
            </div>
            {editing.lines.length > 0 && (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {editing.lines.map((l, i) => (
                  <li key={i} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="min-w-0 flex-1 truncate font-semibold">{l.name}</span>
                    <button type="button" aria-label="−" onClick={() => bump(i, -1)} className="h-11 w-11 rounded-lg bg-surface-2"><Minus size={16} aria-hidden className="mx-auto" /></button>
                    <span className="w-8 text-center font-bold tabular-nums">{l.qty}</span>
                    <button type="button" aria-label="+" onClick={() => bump(i, 1)} className="h-11 w-11 rounded-lg bg-brand-soft text-brand-ink"><Plus size={16} aria-hidden className="mx-auto" /></button>
                    <span className="w-20 text-right tabular-nums">{rupees(l.qty * l.unitPaise)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Sheet>

      {/* Settle an open order: to the room, or paid here. */}
      <Sheet open={!!settling} onOpenChange={(o) => !o && setSettling(null)} title={settling ? `${rupees(settling.totalPaise)}` : ""}
        description={settling ? settling.lines.map((l) => `${l.qty}× ${l.name}`).join(", ") : undefined}>
        {settling && (
          <div className="space-y-4">
            {settling.taxRateBp > 0 && <p className="text-sm text-ink-soft">{t("pos.gstIncluded", { rate: settling.taxRateBp / 100 })}</p>}
            <Button variant="secondary" className="w-full" onClick={() => { setEditing({ id: settling.id, bookingId: settling.bookingId ?? "", tableLabel: settling.tableLabel, lines: settling.lines }); setSettling(null) }}>
              {t("pos.editOrder")}
            </Button>
            <Field label={t("pos.postToRoom")}>
              <div className="flex gap-2">
                <select value={postTo} onChange={(e) => setPostTo(e.target.value)}>
                  <option value="">—</option>
                  {data.inHouse.map((b) => <option key={b.id} value={b.id}>{guestLabel(b.id)}</option>)}
                </select>
                <Button disabled={busy || !postTo} onClick={() => run(async () => { await api(`/api/restaurant/orders/${settling.id}/post`, { method: "POST", body: { bookingId: postTo } }); setSettling(null) })}>
                  <BedDouble size={18} aria-hidden /> {t("pos.post")}
                </Button>
              </div>
            </Field>
            <Field label={t("pos.payHere")}>
              <div className="flex flex-wrap items-center gap-2">
                <ChoiceChips value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m, label: m.toUpperCase() }))} />
                <Button disabled={busy} onClick={() => run(async () => {
                  const paid = await api<Order>(`/api/restaurant/orders/${settling.id}/pay`, { method: "POST", body: { mode, reference: "" } })
                  setSettling(null)
                  window.open(`${API_BASE}/api/restaurant/orders/${paid.id}/bill`, "_blank")
                })}>{t("action.takePayment")}</Button>
              </div>
            </Field>
            <div className="flex items-end gap-2 border-t border-line pt-3">
              <Field label={t("common.reason")} className="flex-1"><input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></Field>
              <Button variant="danger" disabled={busy || !cancelReason.trim()} onClick={() => run(async () => { await api(`/api/restaurant/orders/${settling.id}/cancel`, { method: "POST", body: { reason: cancelReason } }); setSettling(null) })}>
                <XCircle size={18} aria-hidden /> {t("action.cancel")}
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={!!dish} onOpenChange={(o) => !o && setDish(null)} title={dish?.id ? t("pos.editDish") : t("pos.addDish")}
        footer={<Button size="lg" className="w-full" disabled={busy || !dish?.name?.trim()} onClick={() => dish && run(async () => {
          const body = { name: dish.name, category: dish.category ?? "", pricePaise: dish.pricePaise ?? 0, active: dish.active ?? true, sortOrder: dish.sortOrder ?? 0 }
          if (dish.id) await api(`/api/restaurant/menu/${dish.id}`, { method: "PUT", body })
          else await api("/api/restaurant/menu", { method: "POST", body })
          setDish(null)
        })}>{t("action.save")}</Button>}>
        {dish && (
          <div className="space-y-3">
            <Field label={t("setup.name")}><input value={dish.name ?? ""} onChange={(e) => setDish({ ...dish, name: e.target.value })} autoFocus /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("stay.category")}><input value={dish.category ?? ""} onChange={(e) => setDish({ ...dish, category: e.target.value })} placeholder="Meals, Drinks" /></Field>
              <Field label="₹"><input inputMode="decimal" value={dish.pricePaise ? String(dish.pricePaise / 100) : ""} onChange={(e) => setDish({ ...dish, pricePaise: toPaise(e.target.value) })} /></Field>
            </div>
            {dish.id && (
              <label className="flex gap-3 text-sm">
                <input type="checkbox" checked={dish.active ?? true} onChange={(e) => setDish({ ...dish, active: e.target.checked })} />
                <span>{t("pos.onMenu")}</span>
              </label>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}
