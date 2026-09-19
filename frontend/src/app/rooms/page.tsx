"use client"

/**
 * Housekeeping (PRD H1, H2). Rooms grouped by building and floor as a wall of tiles; one tap opens the room,
 * one more moves it along the cleaning cycle (dirty → cleaning → clean → inspected), because that is what the
 * cleaner does twenty times a day. Taking a room off sale (out of order, or under maintenance) asks for a
 * reason. Each tile also says who is in the room now, and for a dormitory how many beds are taken.
 */
import { useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Ban, Check, ClipboardCheck, PackageSearch, Sparkles, Unlock, UserRound, Wrench } from "lucide-react"
import { clsx } from "clsx"
import { api, ApiError } from "@/lib/api"
import { useAutoRefresh, useResource } from "@/lib/use-resource"
import { formatDate } from "@/lib/format"
import { OFF_SALE, type Room, type RoomStatus } from "@/lib/types"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { Banner, Button, Chip, ChoiceChips, Disclosure, Field, Loading, Menu, PageHeader, SectionLabel, Segmented, Sheet, TONE, type MenuItem, type Tone } from "@/components/ui"
import { ReportIssue } from "@/components/ReportIssue"

type Filter = "all" | "clean" | "dirty" | "blocked" | "mine"
const STATUS_TONE: Record<RoomStatus, Tone> = { clean: "ok", inspected: "ok", dirty: "warn", cleaning: "info", blocked: "danger", maintenance: "danger" }
/** The filter a status belongs to: the three the desk has always used, each now covering its neighbours. */
const GROUP: Record<RoomStatus, "clean" | "dirty" | "blocked"> = { clean: "clean", inspected: "clean", dirty: "dirty", cleaning: "dirty", blocked: "blocked", maintenance: "blocked" }
type Person = { id: string; name: string; role: string }

export default function RoomsPage() {
  const { t } = useI18n()
  const { user, has } = useSession()
  const { data: rooms, error: loadError, reload, set } = useResource(() => api<Room[]>("/api/rooms"), [], t("error.generic"))
  const housekeeping = has("housekeeping")
  const { data: people } = useResource(() => (housekeeping ? api<Person[]>("/api/housekeepers") : Promise.resolve([])), [housekeeping], t("error.generic"))
  const [filter, setFilter] = useState<Filter>("all")
  const [openId, setOpenId] = useState<string | null>(null)
  const [offSaleAs, setOffSaleAs] = useState<"blocked" | "maintenance" | null>(null)
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const [assign, setAssign] = useState<{ housekeeperId: string; priority: string; note: string } | null>(null)
  const [reporting, setReporting] = useState(false)

  // Housekeeping works on other phones: keep the wall current.
  useAutoRefresh(reload)

  const counts = useMemo(() => {
    const c = { clean: 0, dirty: 0, blocked: 0 }
    for (const r of rooms ?? []) c[GROUP[r.status]]++
    return c
  }, [rooms])

  async function setStatus(room: Room, status: RoomStatus, why?: string) {
    // Optimistic: the desk sees the change instantly, and a failure puts it straight back.
    set((current) => current.map((r) => (r.id === room.id ? { ...r, status, blockedReason: why ?? null } : r)))
    try {
      await api(`/api/rooms/${room.id}/status`, { method: "PATCH", body: { status, reason: why ?? null, until: null } })
      reload()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
      reload()
    }
  }

  async function saveAssignment(room: Room) {
    if (!assign) return
    try {
      await api(`/api/rooms/${room.id}/housekeeping`, { method: "PATCH", body: { housekeeperId: assign.housekeeperId || null, priority: assign.priority, note: assign.note } })
      setAssign(null)
      reload()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
    }
  }

  if (!rooms) return loadError ? <Banner tone="danger">{loadError}</Banner> : <Loading />

  const open = rooms.find((r) => r.id === openId) ?? null
  const mine = rooms.filter((r) => r.housekeeperId === user?.id)
  // Building first (when there is more than one), then floor.
  const groups = [...new Map(rooms.map((r) => [`${r.building}#${r.floor}`, { building: r.building, floor: r.floor }])).values()]
    .sort((a, b) => a.building.localeCompare(b.building) || a.floor - b.floor)
  const shown = filter === "all" ? rooms : filter === "mine" ? mine : rooms.filter((r) => GROUP[r.status] === filter)
  const label = (s: RoomStatus) => t(`rooms.status.${s}` as "rooms.status.clean")

  const close = () => { setOpenId(null); setOffSaleAs(null); setReason(""); setAssign(null) }
  const act = (room: Room, status: RoomStatus) => { void setStatus(room, status); close() }
  const more: MenuItem[] = [
    ...(has("maintenance") || has("maintenance.report") ? [{ label: t("maint.title"), icon: Wrench, href: "/maintenance" }] : []),
    ...(housekeeping ? [{ label: t("lost.title"), icon: PackageSearch, href: "/lost-found" }] : []),
  ]

  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.rooms")} subtitle={t("rooms.summary", counts)} actions={more.length > 0 ? <Menu items={more} /> : undefined} />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}

      <Segmented
        value={filter}
        onChange={setFilter}
        items={[
          { value: "all", label: t("common.all"), count: rooms.length, tone: "brand" },
          ...(mine.length > 0 ? [{ value: "mine" as const, label: t("rooms.mine"), count: mine.length, tone: "info" as const }] : []),
          { value: "clean", label: label("clean"), count: counts.clean, tone: "ok" },
          { value: "dirty", label: label("dirty"), count: counts.dirty, tone: "warn" },
          { value: "blocked", label: label("blocked"), count: counts.blocked, tone: "danger" },
        ]}
      />

      {groups.map(({ building, floor }) => {
        const key = `${building}#${floor}`
        const onFloor = shown.filter((r) => r.building === building && r.floor === floor)
        if (onFloor.length === 0) return null
        return (
          <section key={key}>
            <SectionLabel>{building ? `${building} · ${t("rooms.floor", { n: floor })}` : t("rooms.floor", { n: floor })}</SectionLabel>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
              {onFloor.map((room) => {
                const tone = STATUS_TONE[room.status]
                const bedsTaken = room.beds.filter((b) => b.active && b.occupancy).length
                const bedsTotal = room.beds.filter((b) => b.active).length
                return (
                  <li key={room.id}>
                    <button
                      onClick={() => setOpenId(room.id)}
                      aria-label={`${room.number} · ${label(room.status)}`}
                      className={clsx(
                        "relative flex w-full flex-col items-start gap-1 overflow-hidden rounded-2xl border border-line bg-surface p-3 text-left shadow-[var(--shadow-card)] transition-colors hover:bg-surface-2",
                      )}
                    >
                      <span aria-hidden className={clsx("absolute inset-y-0 left-0 w-1.5", TONE[tone].solid)} />
                      {room.hkPriority === "high" && <AlertTriangle size={14} aria-label={t("priority.high")} className="absolute right-2 top-2 text-danger" />}
                      <span className="pl-1.5 text-xl font-bold leading-none tabular-nums">{room.number}</span>
                      <span className="w-full truncate pl-1.5 text-[11px] text-ink-soft">{room.roomTypeName}</span>
                      <Chip tone={tone} dot className="ml-1.5 mt-0.5 max-w-[calc(100%-0.375rem)]"><span className="min-w-0 truncate">{label(room.status)}</span></Chip>
                      <span className="w-full truncate pl-1.5 text-[11px] font-semibold text-ink-soft">
                        {bedsTotal > 0 && !room.occupancy
                          ? t("rooms.bedsTaken", { n: bedsTaken, total: bedsTotal })
                          : room.occupancy
                            ? t(`rooms.${room.occupancy.state}` as "rooms.occupied")
                            : t("rooms.available")}
                        {room.housekeeperName && ` · ${room.housekeeperName}`}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      <Sheet
        open={!!open}
        onOpenChange={(o) => !o && close()}
        title={open ? `${t("nav.rooms")} ${open.number}` : ""}
        description={open ? [open.roomTypeName, open.building, t("rooms.floor", { n: open.floor })].filter(Boolean).join(" · ") : undefined}
      >
        {open && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2.5">
              <span className="text-sm text-ink-soft">{t("common.details")}</span>
              <Chip tone={STATUS_TONE[open.status]} dot>{label(open.status)}</Chip>
            </div>
            {open.blockedReason && <p className="text-sm text-ink-soft">{open.blockedReason}</p>}
            {open.hkNote && <Banner tone={open.hkPriority === "high" ? "warn" : "info"}>{open.hkNote}</Banner>}

            {/* Who is here now, room by room or bed by bed. */}
            {open.occupancy && <OccupancyRow label={open.number} occupancy={open.occupancy} canOpen={has("reservations.view")} />}
            {open.beds.length > 0 && !open.occupancy && (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {open.beds.filter((b) => b.active).map((bed) => (
                  <li key={bed.id}>
                    {bed.occupancy ? <OccupancyRow label={bed.label} occupancy={bed.occupancy} canOpen={has("reservations.view")} flat /> : (
                      <div className="flex min-h-[44px] items-center justify-between px-3 text-sm">
                        <span className="font-semibold tabular-nums">{bed.label}</span>
                        <Chip tone="ok">{t("rooms.available")}</Chip>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {!offSaleAs ? (
              <div className="grid gap-2">
                {OFF_SALE.includes(open.status) ? (
                  <Button size="lg" onClick={() => act(open, open.status === "maintenance" ? "dirty" : "clean")}>
                    {open.status === "maintenance" ? <Wrench size={20} aria-hidden /> : <Unlock size={20} aria-hidden />}
                    {open.status === "maintenance" ? t("rooms.repairDone") : t("rooms.unblock")}
                  </Button>
                ) : (
                  <>
                    {open.status === "dirty" && (
                      <>
                        <Button size="lg" onClick={() => act(open, "clean")}><Sparkles size={20} aria-hidden /> {t("rooms.markClean")}</Button>
                        <Button variant="soft" onClick={() => act(open, "cleaning")}><Sparkles size={18} aria-hidden /> {t("rooms.startCleaning")}</Button>
                      </>
                    )}
                    {open.status === "cleaning" && <Button size="lg" onClick={() => act(open, "clean")}><Sparkles size={20} aria-hidden /> {t("rooms.markClean")}</Button>}
                    {open.status === "clean" && (
                      <>
                        <Button size="lg" onClick={() => act(open, "inspected")}><ClipboardCheck size={20} aria-hidden /> {t("rooms.markInspected")}</Button>
                        <Button variant="soft" onClick={() => act(open, "dirty")}><Check size={18} aria-hidden /> {t("rooms.markDirty")}</Button>
                      </>
                    )}
                    {open.status === "inspected" && (
                      <Button size="lg" variant="soft" onClick={() => act(open, "dirty")}><Check size={20} aria-hidden /> {t("rooms.markDirty")}</Button>
                    )}
                    <Button variant="ghost" className="text-danger hover:bg-danger-soft" onClick={() => setOffSaleAs("blocked")}>
                      <Ban size={18} aria-hidden /> {t("rooms.block")}
                    </Button>
                    <Button variant="ghost" className="text-danger hover:bg-danger-soft" onClick={() => setOffSaleAs("maintenance")}>
                      <Wrench size={18} aria-hidden /> {t("rooms.maintenance")}
                    </Button>
                  </>
                )}
                {has("maintenance.report") && (
                  <Button variant="ghost" onClick={() => setReporting(true)}>
                    <AlertTriangle size={18} aria-hidden /> {t("maint.report")}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <Field label={offSaleAs === "maintenance" ? t("rooms.maintenanceReason") : t("rooms.blockReason")}>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
                </Field>
                <div className="flex gap-2">
                  <Button variant="danger" className="flex-1" disabled={!reason.trim()} onClick={() => { void setStatus(open, offSaleAs, reason); close() }}>
                    {offSaleAs === "maintenance" ? t("rooms.maintenance") : t("rooms.block")}
                  </Button>
                  <Button variant="secondary" className="flex-1" onClick={() => { setOffSaleAs(null); setReason("") }}>
                    {t("action.cancel")}
                  </Button>
                </div>
              </div>
            )}

            {housekeeping && (
              <Disclosure
                title={t("rooms.assign")}
                summary={[open.housekeeperName ?? t("rooms.unassigned"), t(`priority.${open.hkPriority}` as "priority.normal")].join(" · ")}
              >
                {(() => {
                  const a = assign ?? { housekeeperId: open.housekeeperId ?? "", priority: open.hkPriority, note: open.hkNote }
                  return (
                    <div className="space-y-3">
                      <Field label={t("rooms.assignTo")}>
                        <select value={a.housekeeperId} onChange={(e) => setAssign({ ...a, housekeeperId: e.target.value })}>
                          <option value="">{t("rooms.unassigned")}</option>
                          {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </Field>
                      <Field label={t("rooms.priority")}>
                        <ChoiceChips value={a.priority} onChange={(v) => setAssign({ ...a, priority: v })}
                          options={(["low", "normal", "high"] as const).map((p) => ({ value: p, label: t(`priority.${p}`) }))} />
                      </Field>
                      <Field label={t("rooms.note")}>
                        <input value={a.note} maxLength={300} onChange={(e) => setAssign({ ...a, note: e.target.value })} />
                      </Field>
                      <Button className="w-full" disabled={!assign} onClick={() => saveAssignment(open)}>{t("action.save")}</Button>
                    </div>
                  )
                })()}
              </Disclosure>
            )}
          </div>
        )}
      </Sheet>

      {open && <ReportIssue open={reporting} onOpenChange={setReporting} roomId={open.id} roomNumber={open.number} onDone={reload} />}
    </div>
  )
}

/** One unit's guest: in the house, or arriving today; a tap opens the stay for someone who may see it. */
function OccupancyRow({ label, occupancy, canOpen, flat }: { label: string; occupancy: NonNullable<Room["occupancy"]>; canOpen: boolean; flat?: boolean }) {
  const { t } = useI18n()
  const body = (
    <>
      <UserRound size={16} aria-hidden className="shrink-0 text-ink-soft" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{label} · {occupancy.guestName}</span>
        <span className="block text-xs text-ink-soft">{t("action.checkOut")} {formatDate(occupancy.departAt)}</span>
      </span>
      <Chip tone={occupancy.state === "occupied" ? "brand" : "violet"}>{t(`rooms.${occupancy.state}` as "rooms.occupied")}</Chip>
    </>
  )
  const cls = clsx("flex min-h-[44px] items-center gap-2.5 px-3 py-2 text-sm", !flat && "rounded-xl border border-line")
  return canOpen ? <Link href={`/stays/${occupancy.bookingId}`} className={clsx(cls, "hover:bg-surface-2")}>{body}</Link> : <div className={cls}>{body}</div>
}
