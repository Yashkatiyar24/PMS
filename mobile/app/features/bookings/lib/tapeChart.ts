import { addDays, diffInDays } from "@/utils/date"

import type { TapeChart, TapeOccupancy, TapeUnit } from "../types"

export type Lane = { unit: TapeUnit; key: string; label: string; offSale: boolean; bars: Bar[] }
export type Bar = { occupancy: TapeOccupancy; from: number; to: number }
export type Group = { type: string; lanes: Lane[] }

/** The days across the top of the chart, `yyyy-mm-dd` each. */
export function chartDays(chart: TapeChart): string[] {
  return Array.from({ length: chart.days }, (_, i) => addDays(chart.start, i))
}

/** Units grouped by type (private rooms first, dormitory beds after), each with its bars placed on the day axis. */
export function groupLanes(chart: TapeChart): Group[] {
  const groups = new Map<string, Lane[]>()
  const sorted = [...chart.units].sort(
    (a, b) =>
      Number(a.is_dormitory) - Number(b.is_dormitory) || a.type_name.localeCompare(b.type_name),
  )
  for (const unit of sorted) {
    const key = unit.bed_id ?? unit.room_id
    const bars = chart.occupancy
      .filter(
        (o) =>
          o.unit_id === key ||
          (o.bed_id ? o.bed_id === unit.bed_id : o.room_id === unit.room_id && !unit.bed_id),
      )
      .map((o) => placeBar(chart, o))
      .filter((b): b is Bar => b !== null)
    const lane: Lane = {
      unit,
      key,
      label: unit.label
        ? unit.label.startsWith(unit.number)
          ? unit.label
          : `${unit.number}/${unit.label}`
        : unit.number,
      offSale: unit.status === "blocked" || unit.status === "maintenance",
      bars,
    }
    groups.set(unit.type_name, [...(groups.get(unit.type_name) ?? []), lane])
  }
  return [...groups.entries()].map(([type, lanes]) => ({ type, lanes }))
}

/** A stay as day indexes: arrival afternoon to departure morning, so it spans `from` to `to` (exclusive), clipped to the chart. */
export function placeBar(chart: TapeChart, o: TapeOccupancy): Bar | null {
  const from = diffInDays(chart.start, o.arrive_at.slice(0, 10))
  const to = Math.max(diffInDays(chart.start, o.depart_at.slice(0, 10)), from + 1)
  if (to <= 0 || from >= chart.days) return null
  return { occupancy: o, from: Math.max(0, from), to: Math.min(chart.days, to) }
}

/** Per day: how many sellable units are busy, and how many free. */
export function dayLoad(
  chart: TapeChart,
  groups: Group[],
): { busy: number; free: number; pct: number }[] {
  const lanes = groups.flatMap((g) => g.lanes)
  return chartDays(chart).map((_, day) => {
    const sellable = lanes.filter((l) => !l.offSale)
    const busy = sellable.filter((l) =>
      l.bars.some((b) => b.from <= day && day < b.to && b.occupancy.state !== "cancelled"),
    ).length
    const free = sellable.length - busy
    return { busy, free, pct: sellable.length ? Math.round((busy / sellable.length) * 100) : 0 }
  })
}
