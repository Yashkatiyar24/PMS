import { addDays, addMonths, monthRange, today, weekStart } from "@/utils/date"

export type RangeKey = "today" | "yesterday" | "week" | "month" | "lastMonth" | "custom"
export const RANGE_KEYS: RangeKey[] = ["today", "yesterday", "week", "month", "lastMonth", "custom"]

/** From/to for a preset, on local calendar days. */
export function rangeFor(key: RangeKey, now = today()): { from: string; to: string } {
  switch (key) {
    case "today":
      return { from: now, to: now }
    case "yesterday":
      return { from: addDays(now, -1), to: addDays(now, -1) }
    case "week":
      return { from: weekStart(now), to: now }
    case "month":
      return { from: monthRange(now).from, to: now }
    case "lastMonth":
      return monthRange(addMonths(monthRange(now).from, -1))
    default:
      return { from: now, to: now }
  }
}
