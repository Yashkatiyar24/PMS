"use client"

/**
 * The tape chart (PRD B4): rooms down, days across, scrolled sideways with a sticky room column. A stay is
 * one continuous bar, named once at its start. A free cell starts a booking for that unit and date; an
 * occupied one opens the stay.
 */
import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CalendarPlus } from "lucide-react"
import { clsx } from "clsx"
import { api } from "@/lib/api"
import { useResource } from "@/lib/use-resource"
import { useI18n } from "@/i18n"
import { Banner, Button, Chip, Loading, PageHeader } from "@/components/ui"

type Unit = { room_id: string; number: string; floor: number; status: string; type_name: string; is_dormitory: boolean; bed_id: string | null; label: string | null }
type Occupancy = { room_id: string; bed_id: string | null; arrive_at: string; depart_at: string; booking_id: string; state: string; guest_name: string }
type Chart = { start: string; days: number; units: Unit[]; occupancy: Occupancy[] }

const DAY = 86_400_000

export default function BookingsPage() {
  const { t, language } = useI18n()
  const router = useRouter()
  // Empty means "from today": the server picks the day, so nothing here depends on the browser clock.
  const [start, setStart] = useState("")
  const { data: chart, error } = useResource(
    () => api<Chart>(`/api/bookings/tape-chart${start ? `?start=${start}` : ""}`),
    [start],
    t("error.generic"),
  )

  const days = useMemo(() => {
    if (!chart) return []
    const from = new Date(`${chart.start}T00:00:00`)
    return Array.from({ length: chart.days }, (_, i) => new Date(from.getTime() + i * DAY))
  }, [chart])

  /** Which booking, if any, holds this unit on this day. */
  const holder = useCallback(
    (unit: Unit, day: Date): Occupancy | undefined => {
      if (!chart) return undefined
      const dayStart = day.getTime()
      return chart.occupancy.find(
        (o) =>
          o.room_id === unit.room_id &&
          (o.bed_id ?? null) === (unit.bed_id ?? null) &&
          new Date(o.arrive_at).getTime() < dayStart + DAY &&
          new Date(o.depart_at).getTime() > dayStart,
      )
    },
    [chart],
  )

  if (!chart) return error ? <Banner tone="danger">{error}</Banner> : <Loading />

  const weekday = new Intl.DateTimeFormat(language === "hi" ? "hi-IN" : "en-IN", { weekday: "short" })
  const todayKey = chart.start

  return (
    <div className="space-y-3">
      <PageHeader
        title={t("nav.bookings")}
        actions={
          <Link href="/bookings/new">
            <Button size="sm">
              <CalendarPlus size={16} aria-hidden /> {t("booking.new")}
            </Button>
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={start || chart.start} onChange={(e) => setStart(e.target.value)} className="!min-h-[38px] !w-auto !py-1.5 text-sm" aria-label={t("booking.arrival")} />
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Chip tone="brand" dot>{t("state.checked_in")}</Chip>
          <Chip tone="warn" dot>{t("state.reserved")}</Chip>
          <Chip tone="danger" dot>{t("rooms.status.blocked")}</Chip>
        </div>
      </div>

      <div className="scroll-thin overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]">
        <table className="min-w-max border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-r border-line bg-surface px-3 py-2 text-left font-semibold text-ink-soft">{t("nav.rooms")}</th>
              {days.map((day) => {
                const key = day.toISOString().slice(0, 10)
                const today = key === todayKey
                return (
                  <th key={key} className={clsx("min-w-[46px] border-b border-line px-1 py-1.5 font-medium", today ? "text-brand-ink" : "text-ink-soft")}>
                    <span className="block text-[10px] uppercase">{weekday.format(day)}</span>
                    <span className={clsx("mx-auto mt-0.5 grid h-6 w-6 place-items-center rounded-full text-[13px] font-bold", today && "bg-brand text-white")}>{day.getDate()}</span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {chart.units.map((unit) => {
              const blocked = unit.status === "blocked"
              return (
                <tr key={`${unit.room_id}-${unit.bed_id ?? ""}`}>
                  <th className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-line bg-surface px-3 py-1 text-left">
                    <span className="font-bold tabular-nums">{unit.label ? `${unit.number}/${unit.label}` : unit.number}</span>
                    <span className="ml-1.5 text-[10px] font-normal text-ink-faint">{unit.type_name}</span>
                  </th>
                  {days.map((day, i) => {
                    const booked = holder(unit, day)
                    const prev = booked && i > 0 ? holder(unit, days[i - 1]) : undefined
                    const next = booked && i < days.length - 1 ? holder(unit, days[i + 1]) : undefined
                    const starts = !prev || prev.booking_id !== booked?.booking_id
                    const ends = !next || next.booking_id !== booked?.booking_id
                    const bar = booked
                      ? booked.state === "checked_in"
                        ? "bg-brand text-white"
                        : "bg-warn-soft text-warn border border-warn/40"
                      : ""
                    return (
                      <td key={day.toISOString()} className={clsx("h-11 min-w-[46px] border-b border-line p-0", blocked && "bg-danger-soft/60")}>
                        <button
                          className="h-11 w-full px-[2px]"
                          title={booked ? booked.guest_name : blocked ? t("rooms.status.blocked") : t("booking.new")}
                          onClick={() =>
                            booked
                              ? router.push(`/stays/${booked.booking_id}`)
                              : !blocked &&
                                router.push(
                                  // Tonight is a walk-in; any later day is an advance booking.
                                  i === 0
                                    ? `/check-in?room=${unit.room_id}&bed=${unit.bed_id ?? ""}`
                                    : `/bookings/new?room=${unit.room_id}&bed=${unit.bed_id ?? ""}&date=${day.toISOString().slice(0, 10)}`,
                                )
                          }
                        >
                          {booked ? (
                            <span className={clsx("flex h-7 items-center overflow-hidden px-1.5 text-[11px] font-semibold", bar, starts && "ml-1 rounded-l-full", ends && "mr-1 rounded-r-full")}>
                              {starts && <span className="truncate">{booked.guest_name.split(" ")[0]}</span>}
                            </span>
                          ) : blocked ? (
                            <span className="text-danger">✕</span>
                          ) : null}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
