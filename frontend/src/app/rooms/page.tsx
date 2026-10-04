"use client"

/**
 * Housekeeping (PRD H1, H2). Rooms grouped by building and floor as a wall of tiles; one tap opens the room,
 * one more moves it along the cleaning cycle (dirty → cleaning → clean → inspected), because that is what the
 * cleaner does twenty times a day. Taking a room off sale (out of order, or under maintenance) asks for a
 * reason. Each tile also says who is in the room now, and for a dormitory how many beds are taken.
 */
import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, Ban, BedDouble, Check, ClipboardCheck, LayoutGrid, Layers, PackageSearch, Sparkles, Unlock, UserRound, Wrench } from "lucide-react"
import { clsx } from "clsx"
import { api, ApiError } from "@/lib/api"
import { useAutoRefresh, useResource } from "@/lib/use-resource"
import { formatDate } from "@/lib/format"
import { OFF_SALE, type Room, type RoomStatus } from "@/lib/types"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { Banner, Button, Chip, ChoiceChips, Disclosure, Empty, Field, Loading, Menu, PageHeader, SectionLabel, Segmented, Sheet, type MenuItem, type Tone } from "@/components/ui"
import { ReportIssue } from "@/components/ReportIssue"

type Filter = "all" | "clean" | "dirty" | "blocked" | "mine"
const STATUS_TONE: Record<RoomStatus, Tone> = { clean: "ok", inspected: "ok", dirty: "warn", cleaning: "info", blocked: "danger", maintenance: "danger" }
/** The filter a status belongs to: the three the desk has always used, each now covering its neighbours. */
const GROUP: Record<RoomStatus, "clean" | "dirty" | "blocked"> = { clean: "clean", inspected: "clean", dirty: "dirty", cleaning: "dirty", blocked: "blocked", maintenance: "blocked" }
type Person = { id: string; name: string; role: string }

/**
 * The board's colour for one room, the reference's housekeeping wall: a square chip with the number on it, its
 * fill telling the housekeeping state — dirty a pale red, being cleaned amber, inspected a teal tint, clean plain
 * white, off sale grey — and a dot repeating the tone so status never rides on the fill alone. The open room is
 * solid teal.
 */
const CHIP: Record<RoomStatus, { fill: string; dot: string }> = {
  dirty: { fill: "bg-danger-soft text-danger", dot: "bg-danger" },
  cleaning: { fill: "bg-warn-soft text-warn", dot: "bg-warn" },
  inspected: { fill: "bg-brand-soft text-brand-ink", dot: "bg-brand" },
  clean: { fill: "bg-surface text-ink", dot: "bg-ok" },
  blocked: { fill: "bg-surface-2 text-ink-soft", dot: "bg-ink-faint" },
  maintenance: { fill: "bg-surface-2 text-ink-soft", dot: "bg-ink-faint" },
}
/** What the legend explains, in the order the eye meets them on the wall. */
const LEGEND: RoomStatus[] = ["dirty", "cleaning", "inspected", "clean", "blocked"]

export default function RoomsPage() {
  const { t } = useI18n()
  const { user, has } = useSession()
  const router = useRouter()
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
    ...(has("lost_found") ? [{ label: t("lost.title"), icon: PackageSearch, href: "/lost-found" }] : []),
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

      {/* A property whose rooms have never been set up: the board has nothing to show and nothing to do, so it
          says so and points at the one screen that fixes it. Only a manager can act on that. */}
      {rooms.length === 0 && (
        <Empty icon={BedDouble} action={has("staff.manage") ? (
          <Button variant="soft" size="sm" onClick={() => router.push("/settings/rooms/setup")}>
            <LayoutGrid size={16} aria-hidden /> {t("setup.planRooms")}
          </Button>
        ) : undefined}>
          {t("setup.noRoomsYetHint")}
        </Empty>
      )}

      {/* The legend reads first, so the wall below needs no words on it. */}
      {rooms.length > 0 && (
        <ul aria-label={t("common.details")} className="flex flex-wrap gap-x-4 gap-y-1.5 px-1 text-xs font-semibold text-ink-soft">
          {LEGEND.map((status) => (
            <li key={status} className="flex items-center gap-1.5">
              <span aria-hidden className={clsx("inline-block h-3.5 w-3.5 rounded-[5px] shadow-[inset_0_0_0_1px_var(--color-line)]", CHIP[status].fill.split(" ")[0])} />
              {label(status)}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-1 w-3.5 rounded-full bg-ink" />
            {t("rooms.occupied")}
          </li>
        </ul>
      )}

      {groups.map(({ building, floor }) => {
        const key = `${building}#${floor}`
        const onFloor = shown.filter((r) => r.building === building && r.floor === floor)
        if (onFloor.length === 0) return null
        return (
          <section key={key}>
            <SectionLabel icon={Layers}>{building ? `${building} · ${t("rooms.floor", { n: floor })}` : t("rooms.floor", { n: floor })}</SectionLabel>
            {/* Five across on a phone, as many as fit at 4.5rem above that: a wall of numbers housekeeping reads
                in one glance, the way the reference board does. Everything else about a room is one tap away. */}
            <ul className="grid grid-cols-5 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] sm:gap-2.5">
              {onFloor.map((room) => {
                const chip = CHIP[room.status]
                const bedsTaken = room.beds.filter((b) => b.active && b.occupancy).length
                const bedsTotal = room.beds.filter((b) => b.active).length
                // A dormitory carries its guests on its beds, not on the room, so a full one has to be worked
                // out: ten of ten beds taken is as occupied as a room with somebody's name on it.
                const taken = room.occupancy?.state === "occupied" || (bedsTotal > 0 && bedsTaken > 0)
                const who = bedsTotal > 0 && !room.occupancy
                  ? t("rooms.bedsTaken", { n: bedsTaken, total: bedsTotal })
                  : room.occupancy
                    ? `${t(`rooms.${room.occupancy.state}` as "rooms.occupied")}${room.occupancy.guestName ? ` · ${room.occupancy.guestName}` : ""}`
                    : t("rooms.available")
                const selected = room.id === openId
                return (
                  <li key={room.id}>
                    <button
                      onClick={() => setOpenId(room.id)}
                      aria-label={`${room.number} · ${label(room.status)} · ${who}`}
                      aria-pressed={selected}
                      title={`${room.roomTypeName} · ${who}`}
                      className={clsx(
                        "press relative flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)]",
                        selected ? "cta text-on-solid" : chip.fill,
                      )}
                    >
                      <span className="text-[19px] font-bold leading-none tabular-nums tracking-tight sm:text-xl">{room.number}</span>
                      <span className="flex h-2 items-center gap-1" aria-hidden>
                        <span className={clsx("h-1.5 w-1.5 rounded-full", selected ? "bg-on-solid" : chip.dot)} />
                        {taken && <span className={clsx("h-1 w-3.5 rounded-full", selected ? "bg-on-solid" : "bg-ink")} />}
                      </span>
                      {room.hkPriority === "high" && (
                        <span className={clsx("absolute right-1.5 top-1.5 text-[11px] font-extrabold leading-none", selected ? "text-on-solid" : "text-warn")} aria-label={t("priority.high")}>!</span>
                      )}
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
            <div className={clsx("flex items-center justify-between rounded-xl px-3 py-2.5", CHIP[open.status].fill, open.status === "clean" && "shadow-[var(--shadow-card)]")}>
              <span className="text-sm">{t("common.details")}</span>
              <Chip tone={STATUS_TONE[open.status]} dot>{label(open.status)}</Chip>
            </div>
            {open.blockedReason && <p className="text-sm text-ink-soft">{open.blockedReason}</p>}
            {open.hkNote && <Banner tone={open.hkPriority === "high" ? "warn" : "info"}>{open.hkNote}</Banner>}

            {/* Who is here now, room by room or bed by bed. */}
            {open.occupancy && <OccupancyRow label={open.number} occupancy={open.occupancy} canOpen={has("reservations.view")} />}
            {open.beds.length > 0 && !open.occupancy && (
              <ul className="divide-y divide-line overflow-hidden rounded-xl shadow-[var(--shadow-card)]">
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
                      <Field group label={t("rooms.priority")}>
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
  const cls = clsx("flex min-h-[44px] items-center gap-2.5 px-3 py-2 text-sm", !flat && "rounded-xl shadow-[var(--shadow-card)]")
  return canOpen ? <Link href={`/stays/${occupancy.bookingId}`} className={clsx(cls, "hover:bg-surface-2")}>{body}</Link> : <div className={cls}>{body}</div>
}
