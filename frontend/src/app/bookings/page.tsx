"use client"

/**
 * The tape chart (PRD B4): rooms down, days across, scrolled sideways with a sticky room column.
 * A free cell starts an advance booking for that unit and date; an occupied one opens the stay.
 */
import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CalendarPlus } from "lucide-react"
import { api } from "@/lib/api"
import { useResource } from "@/lib/use-resource"
import { useI18n } from "@/i18n"
import { Banner, Button, Card, Chip, Loading } from "@/components/ui"

type Unit = { room_id: string; number: string; floor: number; status: string; type_name: string; is_dormitory: boolean; bed_id: string | null; label: string | null }
type Occupancy = { room_id: string; bed_id: string | null; arrive_at: string; depart_at: string; booking_id: string; state: string; guest_name: string }
type Chart = { start: string; days: number; units: Unit[]; occupancy: Occupancy[] }

export default function BookingsPage() {
  const { t } = useI18n()
  const router = useRouter()
  // Empty means "from today": the server picks the day, so nothing here depends on the browser clock
  // (which would differ from the prerendered HTML and from the property's own timezone).
  const [start, setStart] = useState("")
  const { data: chart, error } = useResource(
    () => api<Chart>(`/api/bookings/tape-chart${start ? `?start=${start}` : ""}`),
    [start],
    t("error.generic"),
  )

  const days = useMemo(() => {
    if (!chart) return []
    const from = new Date(`${chart.start}T00:00:00`)
    return Array.from({ length: chart.days }, (_, i) => new Date(from.getTime() + i * 86_400_000))
  }, [chart])

  /** Which booking, if any, holds this unit on this day. */
  const holder = useCallback(
    (unit: Unit, day: Date): Occupancy | undefined => {
      if (!chart) return undefined
      const dayStart = day.getTime()
      const dayEnd = dayStart + 86_400_000
      return chart.occupancy.find(
        (o) =>
          o.room_id === unit.room_id &&
          (o.bed_id ?? null) === (unit.bed_id ?? null) &&
          new Date(o.arrive_at).getTime() < dayEnd &&
          new Date(o.depart_at).getTime() > dayStart,
      )
    },
    [chart],
  )

  if (!chart) return error ? <Banner tone="danger">{error}</Banner> : <Loading />

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t("nav.bookings")}</h1>

      <Link href="/bookings/new" className="block">
        <Button className="w-full py-4 text-lg">
          <CalendarPlus size={20} aria-hidden /> {t("booking.new")}
        </Button>
      </Link>

      <input type="date" value={start || chart.start} onChange={(e) => setStart(e.target.value)} className="max-w-48" />

      <div className="flex flex-wrap gap-2 text-xs">
        <Chip tone="info">checked in</Chip>
        <Chip tone="warn">reserved</Chip>
        <Chip tone="danger">{t("rooms.status.blocked")}</Chip>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="min-w-max border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-[var(--color-surface)] px-2 py-2 text-left">{t("nav.rooms")}</th>
              {days.map((day) => (
                <th key={day.toISOString()} className="min-w-[44px] px-1 py-2 font-medium">
                  {day.getDate()}/{day.getMonth() + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.units.map((unit) => (
              <tr key={`${unit.room_id}-${unit.bed_id ?? ""}`} className="border-t border-[var(--color-line)]">
                <th className="sticky left-0 z-10 whitespace-nowrap bg-[var(--color-surface)] px-2 py-1 text-left font-semibold">
                  {unit.label ? `${unit.number}/${unit.label}` : unit.number}
                </th>
                {days.map((day) => {
                  const booked = holder(unit, day)
                  const blocked = unit.status === "blocked"
                  const tone = blocked
                    ? "bg-[var(--color-danger-soft)]"
                    : booked?.state === "checked_in"
                      ? "bg-[var(--color-info-soft)]"
                      : booked
                        ? "bg-[var(--color-warn-soft)]"
                        : ""
                  return (
                    <td key={day.toISOString()} className={`h-11 min-w-[44px] border-l border-[var(--color-line)] p-0 ${tone}`}>
                      <button
                        className="h-11 w-full truncate px-1 text-[10px]"
                        title={booked ? booked.guest_name : undefined}
                        onClick={() =>
                          booked
                            ? router.push(`/stays/${booked.booking_id}`)
                            : !blocked && router.push(`/check-in?room=${unit.room_id}&bed=${unit.bed_id ?? ""}&date=${day.toISOString().slice(0, 10)}`)
                        }
                      >
                        {booked ? booked.guest_name.split(" ")[0] : blocked ? "✕" : ""}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
