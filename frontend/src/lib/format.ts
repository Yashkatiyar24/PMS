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

/**
 * The ten digits of an Indian mobile number, whatever was typed or pasted.
 *
 * Everything that is not a digit goes; a country code or a trunk zero in front of a full number goes with it
 * ("+91 98765 43210", "098765 43210" → "9876543210"); and nothing beyond the tenth digit is kept, so an
 * eleventh keystroke does nothing rather than producing a number the server will refuse. A short number is
 * left short — somebody is still typing it, and a lookup by the last few digits is a thing the desk does.
 *
 * The same rules the backend applies when it stores a guest, so what the screen shows is what gets saved.
 */
export function phoneDigits(input: string): string {
  let digits = (input ?? "").replace(/\D/g, "")
  // Only while the number is too long to be one on its own: 9123456789 is a real mobile, not 91 + 23456789.
  while (digits.length > 10 && (digits.startsWith("91") || digits.startsWith("0")))
    digits = digits.startsWith("91") ? digits.slice(2) : digits.slice(1)
  return digits.slice(0, 10)
}
