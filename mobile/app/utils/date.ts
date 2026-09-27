/**
 * Every date operation in the app. The only file that imports date-fns.
 * The API sends ISO-8601 strings with offsets (`2026-09-27T10:00:00+05:30`), plain dates (`2026-09-27`)
 * and times (`10:00`). Days are always local calendar days, never UTC ones.
 */
import {
  addDays as dfAddDays,
  addMonths as dfAddMonths,
  differenceInCalendarDays,
  differenceInMinutes,
  endOfMonth,
  format,
  isToday as dfIsToday,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns"

/** Parse an API date/datetime string; null for empty or invalid input. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = parseISO(value)
  return isValid(d) ? d : null
}

/** `dd-mm-yyyy`, the format the desk reads (empty for null). */
export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value)
  return d ? format(d, "dd-MM-yyyy") : ""
}

/** `HH:mm`, 24-hour. */
export function formatTime(value: string | Date | null | undefined): string {
  const d = toDate(value)
  return d ? format(d, "HH:mm") : ""
}

/** `dd-mm-yyyy HH:mm`. */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value)
  return d ? `${format(d, "dd-MM-yyyy")} ${format(d, "HH:mm")}` : ""
}

/** Short weekday and day, e.g. `Mon 27`. */
export function formatWeekday(value: string | Date): string {
  const d = toDate(value)
  return d ? format(d, "EEE d") : ""
}

/** Month and year, e.g. `September 2026`. */
export function formatMonth(value: string | Date): string {
  const d = toDate(value)
  return d ? format(d, "MMMM yyyy") : ""
}

/** The local calendar day as `yyyy-mm-dd` (what the API calls a `date`). */
export function toApiDate(value: Date): string {
  return format(value, "yyyy-MM-dd")
}

/** A `yyyy-mm-dd` string to a Date at local midnight. */
export function fromApiDate(value: string): Date | null {
  return parseDate(value)
}

/** A full ISO datetime with the device offset, for `arriveAt`/`departAt` bodies. */
export function toApiDateTime(value: Date): string {
  return format(value, "yyyy-MM-dd'T'HH:mm:ssxxx")
}

/** Combine a `yyyy-mm-dd` day with a `HH:mm` time into a local Date. */
export function atTime(day: string, time: string): Date | null {
  const d = parseDate(`${day}T${time.length === 5 ? time : "00:00"}:00`)
  return d
}

export function today(): string {
  return toApiDate(new Date())
}

export function addDays(day: string, n: number): string {
  const d = parseDate(day)
  return d ? toApiDate(dfAddDays(d, n)) : day
}

export function addMonths(day: string, n: number): string {
  const d = parseDate(day)
  return d ? toApiDate(dfAddMonths(d, n)) : day
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function diffInDays(from: string | Date, to: string | Date): number {
  const a = toDate(from)
  const b = toDate(to)
  return a && b ? differenceInCalendarDays(b, a) : 0
}

/** Nights between two datetimes, never below 1 for a live stay. */
export function nightsBetween(arriveAt: string, departAt: string): number {
  return Math.max(1, diffInDays(arriveAt, departAt))
}

export function isToday(value: string | Date | null | undefined): boolean {
  const d = toDate(value)
  return d ? dfIsToday(d) : false
}

export function isPast(value: string | Date): boolean {
  const d = toDate(value)
  return d ? d.getTime() < Date.now() : false
}

/** First and last day of the month containing `day`. */
export function monthRange(day: string): { from: string; to: string } {
  const d = parseDate(day) ?? new Date()
  return { from: toApiDate(startOfMonth(d)), to: toApiDate(endOfMonth(d)) }
}

/** Monday of the week containing `day`. */
export function weekStart(day: string): string {
  const d = parseDate(day) ?? new Date()
  return toApiDate(startOfWeek(d, { weekStartsOn: 1 }))
}

/** Minutes between now and `value` (negative when in the past). */
export function minutesUntil(value: string): number {
  const d = parseDate(value)
  return d ? differenceInMinutes(d, new Date()) : 0
}

/** Rough age of a timestamp for "Updated 5 min ago" labels. */
export function ageOf(value: string | Date): {
  unit: "now" | "minutes" | "hours" | "days"
  n: number
} {
  const d = toDate(value)
  if (!d) return { unit: "now", n: 0 }
  const minutes = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000))
  if (minutes < 1) return { unit: "now", n: 0 }
  if (minutes < 60) return { unit: "minutes", n: minutes }
  if (minutes < 60 * 24) return { unit: "hours", n: Math.floor(minutes / 60) }
  return { unit: "days", n: Math.floor(minutes / (60 * 24)) }
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  if (value instanceof Date) return isValid(value) ? value : null
  return parseDate(value)
}
