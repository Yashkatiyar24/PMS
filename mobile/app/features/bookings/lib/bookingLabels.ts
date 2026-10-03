import { translateOr } from "@/i18n/translate"
import type { Tone } from "@/theme/tones"
import { nightsBetween } from "@/utils/date"
import { unitName } from "@/utils/format"

import type { Booking, BookingState, PaymentStatus } from "../types"

/** Chip colour for a booking state, as the web colours them. */
export function stateTone(state: BookingState): Tone {
  switch (state) {
    case "pending":
      return "warn"
    case "reserved":
      return "brand"
    case "checked_in":
      return "ok"
    case "no_show":
      return "danger"
    default:
      return "neutral"
  }
}

export function paymentTone(status: PaymentStatus): Tone {
  return status === "paid" ? "ok" : status === "partial" ? "warn" : "danger"
}

/** "phone" → the translated source label, else the raw value humanised. */
export function sourceLabel(source: string): string {
  return translateOr(`source.${source}`, source.replace(/_/g, " "))
}

export function stateLabel(state: BookingState): string {
  return translateOr(`state.${state}`, state.replace(/_/g, " "))
}

/** The units of a booking joined for a row: "101, 102" or "D1/B3". */
export function unitsLabel(booking: Pick<Booking, "units">): string {
  return booking.units.map((u) => unitName(u.roomNumber, u.bedLabel)).join(", ")
}

export function nightsOf(booking: Pick<Booking, "arriveAt" | "departAt">): number {
  return nightsBetween(booking.arriveAt, booking.departAt)
}

/** What is still owed: total plus the deposit held, less what was paid. */
export function balanceDue(folio: {
  totalPaise: number
  depositHeldPaise: number
  paidPaise: number
}): number {
  return folio.totalPaise + folio.depositHeldPaise - folio.paidPaise
}
