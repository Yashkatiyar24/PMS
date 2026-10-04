/** Money, numbers, phones and text. Money is integer paise everywhere; only these functions touch rupees. */

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const INR_DECIMALS = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const NUMBER = new Intl.NumberFormat("en-IN")

/** Paise to a rupee string with Indian grouping: 100000 → ₹1,000; 125050 → ₹1,250.50. */
export function rupees(paise: number | null | undefined): string {
  const value = (paise ?? 0) / 100
  return Number.isInteger(value) ? INR.format(value) : INR_DECIMALS.format(value)
}

/** Paise to a plain rupee number string for an input field: 125050 → "1250.5". */
export function paiseToInput(paise: number | null | undefined): string {
  if (!paise) return ""
  const value = paise / 100
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

/** Typed rupees ("1,250.5") to paise, rounding half-paise away. Empty or junk → 0. */
export function toPaise(text: string | number | null | undefined): number {
  if (typeof text === "number") return Math.round(text * 100)
  const cleaned = (text ?? "").replace(/[^\d.]/g, "")
  if (!cleaned) return 0
  const value = parseFloat(cleaned)
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

/** Indian-grouped integer: 1234567 → 12,34,567. */
export function formatNumber(n: number | null | undefined): string {
  return NUMBER.format(n ?? 0)
}

/** Whole percent with the sign: 63.2 → "63%". */
export function percent(n: number | null | undefined): string {
  return `${Math.round(n ?? 0)}%`
}

/** Digits only: "+91 98765-43210" → "919876543210". */
export function digitsOnly(text: string | null | undefined): string {
  return (text ?? "").replace(/\D/g, "")
}

/** A 10-digit Indian mobile as "98765 43210"; anything else unchanged. */
export function formatPhone(phone: string | null | undefined): string {
  const digits = digitsOnly(phone)
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits
  return local.length === 10 ? `${local.slice(0, 5)} ${local.slice(5)}` : (phone ?? "")
}

/** Cut text to `max` characters with an ellipsis. */
export function truncate(text: string | null | undefined, max: number): string {
  const value = text ?? ""
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

/** Up to two initials from a name, for avatars. */
export function initials(name: string | null | undefined): string {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
}

/**
 * The web's `unitName`: a room number, or the bed label when it already carries the room number,
 * else `room/bed`.
 */
export function unitName(roomNumber: string, bedLabel?: string | null): string {
  if (!bedLabel) return roomNumber
  return bedLabel.startsWith(roomNumber) ? bedLabel : `${roomNumber}/${bedLabel}`
}

/** The booking reference the desk quotes: the first 8 characters of the id, uppercased. */
export function reference(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

/** A number range such as "101-140" expanded to its members; a single number stays alone. */
export function expandRange(range: string): string[] {
  const m = range.trim().match(/^(\d+)\s*-\s*(\d+)$/)
  if (!m) return range.trim() ? [range.trim()] : []
  const from = parseInt(m[1], 10)
  const to = parseInt(m[2], 10)
  if (to < from || to - from > 500) return []
  return Array.from({ length: to - from + 1 }, (_, i) => String(from + i))
}
