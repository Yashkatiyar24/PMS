"use client"

/**
 * The calendar (PRD B4): rooms down, days across. A stay is one continuous bar from the afternoon it arrives
 * to the morning it leaves, named once. Each day says how full it is. Drag a bar to another room or date to
 * move it (a guest who has arrived can change room, not dates); click an empty day to start a booking there.
 * The server decides every move — the database's exclusion constraint still refuses a double booking.
 */
import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, Globe, Link2 } from "lucide-react"
import { clsx } from "clsx"
import { api, ApiError } from "@/lib/api"
import { useResource } from "@/lib/use-resource"
import { dayKey, unitName } from "@/lib/format"
import { useI18n } from "@/i18n"
import { Banner, Button, Chip, IconButton, Loading } from "@/components/ui"

type Unit = { room_id: string; number: string; floor: number; status: string; blocked_reason: string | null; type_name: string; is_dormitory: boolean; bed_id: string | null; label: string | null }
type Occupancy = { unit_id: string; room_id: string; bed_id: string | null; arrive_at: string; depart_at: string; booking_id: string; state: string; source: string; guest_name: string }
type Chart = { start: string; days: number; units: Unit[]; occupancy: Occupancy[] }
type Drag = { bookingId: string; unitId: string; state: string; grab: number; length: number; fromRow: string; fromStart: number }

const DAY = 86_400_000
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10)
/** Whole days from the chart's first day to a timestamp's local calendar day. */
const dayIndex = (start: string, at: string) => Math.round((Date.parse(`${dayKey(new Date(at))}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY)
const rowKey = (u: { room_id: string; bed_id: string | null }) => `${u.room_id}:${u.bed_id ?? ""}`

const BAR: Record<string, string> = {
  reserved: "bg-brand text-on-solid",
  checked_in: "bg-ok text-on-solid",
  checked_out: "bg-line-strong text-ink",
}
// Slanted ends: a stay starts in the afternoon and ends in the morning.
const SLANT = "polygon(9px 0, 100% 0, calc(100% - 9px) 100%, 0 100%)"

export default function BookingsPage() {
  const { t, language } = useI18n()
  const router = useRouter()
  // Empty means "from today": the server picks the day, so nothing here depends on the browser clock.
  const [start, setStart] = useState("")
  const [todayIso, setTodayIso] = useState("")
  const { data: chart, error, reload } = useResource(async () => {
    const c = await api<Chart>(`/api/bookings/tape-chart${start ? `?start=${start}` : ""}`)
    if (!start) setTodayIso(c.start)
    return c
  }, [start], t("error.generic"))
  const [drag, setDrag] = useState<Drag | null>(null)
  const [preview, setPreview] = useState<{ row: string; start: number } | null>(null)
  const [notice, setNotice] = useState<{ tone: "ok" | "danger"; text: string } | null>(null)
  const [moving, setMoving] = useState(false)
  const lanes = useRef(new Map<string, HTMLElement>())

  // Rows grouped by room type, in the server's order (floor, then number), private rooms before dormitory
  // beds: a dormitory of twenty beds would otherwise push every room off the first screen.
  const groups = useMemo(() => {
    const out = new Map<string, Unit[]>()
    for (const u of chart?.units ?? []) out.set(u.type_name, [...(out.get(u.type_name) ?? []), u])
    return [...out.entries()].sort(([, a], [, b]) => Number(a[0].is_dormitory) - Number(b[0].is_dormitory))
  }, [chart])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = (type: string) => setCollapsed((c) => { const next = new Set(c); if (next.has(type)) next.delete(type); else next.add(type); return next })

  const bars = useMemo(() => {
    const byRow = new Map<string, (Occupancy & { from: number; to: number })[]>()
    if (!chart) return byRow
    for (const o of chart.occupancy) {
      const from = dayIndex(chart.start, o.arrive_at)
      const to = Math.max(dayIndex(chart.start, o.depart_at), from + 1) // a day-use stay still takes its day
      byRow.set(rowKey(o), [...(byRow.get(rowKey(o)) ?? []), { ...o, from, to }])
    }
    return byRow
  }, [chart])

  if (!chart) return error ? <Banner tone="danger">{error}</Banner> : <Loading />

  const days = Array.from({ length: chart.days }, (_, i) => addDays(chart.start, i))
  const weekday = new Intl.DateTimeFormat(language === "hi" ? "hi-IN" : "en-IN", { weekday: "short" })
  const offSale = (u: Unit) => u.status === "blocked" || u.status === "maintenance"
  const sellable = chart.units.filter((u) => !offSale(u)).length
  const allBars = [...bars.values()].flat()
  const busy = days.map((_, d) => allBars.filter((b) => b.from <= d && d < b.to).length)

  /** Where in the lane the pointer is, in days (fractional). */
  const position = (row: string, clientX: number) => {
    const lane = lanes.current.get(row)
    if (!lane) return 0
    const rect = lane.getBoundingClientRect()
    return ((clientX - rect.left) / rect.width) * chart.days
  }

  function openDay(unit: Unit, day: number) {
    const date = days[day]
    if (!date || offSale(unit) || (todayIso && date < todayIso)) return
    // Tonight is a walk-in; any later day is an advance booking.
    router.push(date === todayIso
      ? `/check-in?room=${unit.room_id}&bed=${unit.bed_id ?? ""}`
      : `/bookings/new?room=${unit.room_id}&bed=${unit.bed_id ?? ""}&date=${date}`)
  }

  async function drop(unit: Unit, clientX: number) {
    if (!drag || !chart) return
    const row = rowKey(unit)
    // A guest who has arrived keeps their dates; only the room can change.
    const newStart = drag.state === "checked_in" ? drag.fromStart : Math.round(position(row, clientX) - drag.grab)
    const moved = drag
    setDrag(null)
    setPreview(null)
    if (row === moved.fromRow && newStart === moved.fromStart) return
    setMoving(true)
    try {
      await api(`/api/bookings/${moved.bookingId}/move`, {
        method: "POST",
        body: {
          unitId: moved.unitId,
          roomId: row === moved.fromRow ? null : unit.room_id,
          bedId: row === moved.fromRow ? null : unit.bed_id,
          arriveOn: newStart === moved.fromStart ? null : addDays(chart.start, newStart),
        },
      })
      setNotice({ tone: "ok", text: t("cal.moved") })
      reload()
    } catch (e) {
      setNotice({ tone: "danger", text: e instanceof ApiError ? e.message : t("error.generic") })
    } finally {
      setMoving(false)
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">{t("nav.bookings")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-0.5">
            <IconButton label={t("cal.earlier")} onClick={() => setStart(addDays(chart.start, -chart.days))} className="rounded-full"><ChevronLeft size={18} aria-hidden /></IconButton>
            <button onClick={() => setStart("")} className="rounded-full px-3 text-sm font-semibold hover:bg-surface-2">{t("nav.today")}</button>
            <IconButton label={t("cal.later")} onClick={() => setStart(addDays(chart.start, chart.days))} className="rounded-full"><ChevronRight size={18} aria-hidden /></IconButton>
          </div>
          <input type="date" value={chart.start} onChange={(e) => e.target.value && setStart(e.target.value)} className="!w-auto !rounded-full text-sm" aria-label={t("booking.arrival")} />
          <Link href="/bookings/new">
            <Button><CalendarPlus size={18} aria-hidden /> {t("booking.new")}</Button>
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap gap-1.5">
          <Chip tone="brand" dot>{t("state.reserved")}</Chip>
          <Chip tone="ok" dot>{t("state.checked_in")}</Chip>
          <Chip tone="neutral" dot>{t("state.checked_out")}</Chip>
          <Chip tone="danger" dot>{t("rooms.status.blocked")}</Chip>
        </div>
        <p className="hidden text-xs text-ink-soft md:block">{t("cal.dragHint")}</p>
      </div>

      {notice && <Banner tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Banner>}

      <div className={clsx("scroll-thin overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]", moving && "pointer-events-none opacity-70")}>
        <table className="w-full min-w-max border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th rowSpan={2} className="sticky left-0 z-20 w-36 min-w-36 border-b border-r border-line bg-surface px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">{t("nav.rooms")}</th>
              {days.map((day) => {
                const today = day === todayIso
                return (
                  <th key={day} className={clsx("min-w-[56px] border-b border-line px-1 pb-1 pt-2 font-medium md:min-w-[76px]", today ? "text-brand-ink" : "text-ink-soft")}>
                    <span className="block text-[10px] font-semibold uppercase tracking-wide">{weekday.format(new Date(`${day}T00:00:00`))}</span>
                    <span className={clsx("mx-auto mt-0.5 grid h-8 w-8 place-items-center rounded-full text-base font-bold tabular-nums", today ? "bg-brand text-on-solid" : "text-ink")}>
                      {new Date(`${day}T00:00:00`).getDate()}
                    </span>
                  </th>
                )
              })}
            </tr>
            <tr>
              {days.map((day, d) => (
                <th key={day} className="border-b border-line bg-surface-2 px-1 py-1.5 font-normal">
                  <span className="block font-bold tabular-nums text-ink">{sellable ? Math.round((busy[d] * 100) / sellable) : 0}%</span>
                  <span className="block text-[10px] text-ink-soft">{t("dash.free", { n: Math.max(0, sellable - busy[d]) })}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(([type, units]) => [
              <tr key={`type-${type}`}>
                <th colSpan={chart.days + 1} className="border-b border-line bg-surface-2/70 p-0 text-left">
                  <button onClick={() => toggle(type)} aria-expanded={!collapsed.has(type)} className="sticky left-0 inline-flex items-center gap-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-ink-soft hover:text-ink">
                    <ChevronDown size={14} aria-hidden className={clsx("transition-transform", collapsed.has(type) && "-rotate-90")} /> {type} · {units.length}
                  </button>
                </th>
              </tr>,
              ...(collapsed.has(type) ? [] : units).map((unit) => {
                const row = rowKey(unit)
                const blocked = offSale(unit)
                return (
                  <tr key={row}>
                    <th className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-line bg-surface px-4 py-0 text-left">
                      <span className="flex items-center gap-2">
                        <span className={clsx("h-2 w-2 shrink-0 rounded-full", blocked ? "bg-danger" : unit.status === "dirty" || unit.status === "cleaning" ? "bg-warn" : "bg-ok")} aria-hidden />
                        <span className="text-sm font-bold tabular-nums">{unitName(unit.number, unit.label)}</span>
                      </span>
                    </th>
                    <td colSpan={chart.days} className="border-b border-line p-0">
                      <div
                        ref={(el) => { if (el) lanes.current.set(row, el); else lanes.current.delete(row) }}
                        className="relative h-12 cursor-pointer"
                        style={{
                          backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent calc(${100 / chart.days}% - 1px), var(--color-line) calc(${100 / chart.days}% - 1px), var(--color-line) ${100 / chart.days}%)`,
                        }}
                        onClick={(e) => { if (e.target === e.currentTarget) openDay(unit, Math.floor(position(row, e.clientX))) }}
                        onDragOver={(e) => {
                          if (!drag) return
                          e.preventDefault()
                          const s = drag.state === "checked_in" ? drag.fromStart : Math.round(position(row, e.clientX) - drag.grab)
                          if (preview?.row !== row || preview.start !== s) setPreview({ row, start: s })
                        }}
                        onDrop={(e) => { e.preventDefault(); void drop(unit, e.clientX) }}
                      >
                        {todayIso && days.includes(todayIso) && (
                          <span aria-hidden className="pointer-events-none absolute inset-y-0 bg-brand-soft/50" style={{ left: `${(days.indexOf(todayIso) * 100) / chart.days}%`, width: `${100 / chart.days}%` }} />
                        )}
                        {blocked && (
                          <span
                            className="pointer-events-none absolute inset-x-0 inset-y-2 flex items-center overflow-hidden rounded-md px-3 text-[11px] font-semibold text-danger"
                            style={{ backgroundImage: "repeating-linear-gradient(135deg, var(--color-danger-soft) 0 8px, color-mix(in srgb, var(--color-danger) 22%, transparent) 8px 16px)" }}
                          >
                            <span className="sticky left-40 truncate">{unit.blocked_reason || t("rooms.status.blocked")}</span>
                          </span>
                        )}
                        {(bars.get(row) ?? []).map((b) => {
                          const left = Math.max(-0.5, b.from) + 0.5
                          const right = Math.min(chart.days, b.to + 0.5)
                          if (right <= 0 || left >= chart.days) return null
                          const movable = b.state === "reserved" || b.state === "checked_in"
                          return (
                            <span
                              key={b.unit_id}
                              role="link"
                              tabIndex={0}
                              title={`${b.guest_name} · ${unitName(unit.number, unit.label)}`}
                              draggable={movable}
                              onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = "move"
                                e.dataTransfer.setData("text/plain", b.booking_id)
                                setDrag({ bookingId: b.booking_id, unitId: b.unit_id, state: b.state, grab: position(row, e.clientX) - b.from, length: b.to - b.from, fromRow: row, fromStart: b.from })
                              }}
                              onDragEnd={() => { setDrag(null); setPreview(null) }}
                              onClick={() => router.push(`/stays/${b.booking_id}`)}
                              onKeyDown={(e) => { if (e.key === "Enter") router.push(`/stays/${b.booking_id}`) }}
                              className={clsx(
                                "absolute top-2 flex h-8 items-center gap-1.5 overflow-hidden px-3 text-[12px] font-semibold shadow-sm transition-[filter,opacity] hover:brightness-110",
                                BAR[b.state] ?? "bg-line-strong text-ink",
                                movable && "cursor-grab active:cursor-grabbing",
                                drag?.unitId === b.unit_id && "opacity-40",
                              )}
                              style={{ left: `${(left * 100) / chart.days}%`, width: `${((right - left) * 100) / chart.days}%`, clipPath: SLANT }}
                            >
                              {b.source === "website" && <Globe size={12} aria-hidden className="shrink-0 opacity-80" />}
                              {b.source === "ota" && <Link2 size={12} aria-hidden className="shrink-0 opacity-80" />}
                              <span className="truncate">{b.guest_name}</span>
                            </span>
                          )
                        })}
                        {drag && preview?.row === row && (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute top-2 h-8 border-2 border-dashed border-brand bg-brand-soft/60"
                            style={{ left: `${((preview.start + 0.5) * 100) / chart.days}%`, width: `${(drag.length * 100) / chart.days}%`, clipPath: SLANT }}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              }),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  )
}
