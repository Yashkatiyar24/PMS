/** Money and dates as an Indian desk expects them: ₹1,00,000 and 17-09-2026. */

export function rupees(paise: number | null | undefined): string {
  const value = (paise ?? 0) / 100
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/** Paise from what the desk typed in rupees. Empty means zero. */
export function toPaise(rupeesInput: string): number {
  const cleaned = rupeesInput.replace(/[^\d.]/g, "")
  if (!cleaned) return 0
  return Math.round(parseFloat(cleaned) * 100)
}

const DATE = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })
const TIME = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })

export const formatDate = (iso: string | null | undefined) => (iso ? DATE.format(new Date(iso)) : "")
export const formatTime = (iso: string | null | undefined) => (iso ? TIME.format(new Date(iso)) : "")
/**
 * The calendar day a local Date falls on, as yyyy-mm-dd. Never toISOString(): that is the UTC day, which
 * in India is the day before for anything between midnight and 05:30.
 */
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

/** "101", or a dormitory bed: "D1-3" when the bed is already named after its room, else "D1/3". */
export const unitName = (roomNumber: string, bedLabel?: string | null) =>
  !bedLabel ? roomNumber : bedLabel.startsWith(roomNumber) ? bedLabel : `${roomNumber}/${bedLabel}`

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? `${DATE.format(new Date(iso))} ${TIME.format(new Date(iso))}` : ""
