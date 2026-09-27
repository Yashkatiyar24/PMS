import { useState } from "react"

import type { Guest } from "@/features/guests/types"
import { addDays, atTime, toApiDateTime, today } from "@/utils/date"
import { digitsOnly, toPaise } from "@/utils/format"

import type { BookingSource, ReservationRequest, UnitRequest } from "../types"

export type NewBookingForm = {
  phone: string
  name: string
  guest: Guest | null
  arrive: string
  depart: string
  roomTypeId: string | null
  /** A particular unit (single) or the group's units (many). */
  units: UnitRequest[]
  adults: number
  children: number
  source: BookingSource
  groupName: string
  organization: string
  gstin: string
  city: string
  requests: string
  tentative: boolean
  whatsappOptIn: boolean
  advance: string
  mode: string
  consent: boolean
}

export function useNewBookingForm(defaults: {
  date?: string
  mode: string
  roomId?: string
  bedId?: string
}) {
  const start = defaults.date ?? today()
  const [form, setForm] = useState<NewBookingForm>({
    phone: "",
    name: "",
    guest: null,
    arrive: start,
    depart: addDays(start, 1),
    roomTypeId: null,
    units: defaults.roomId
      ? [{ roomId: defaults.roomId, bedId: defaults.bedId ?? null, ratePaise: null }]
      : [],
    adults: 1,
    children: 0,
    source: "phone",
    groupName: "",
    organization: "",
    gstin: "",
    city: "",
    requests: "",
    tentative: false,
    whatsappOptIn: true,
    advance: "",
    mode: defaults.mode,
    consent: false,
  })
  const patch = (p: Partial<NewBookingForm>) => setForm((f) => ({ ...f, ...p }))
  return { form, patch }
}

/** The first thing still missing, in the web's order; null when ready. */
export function missingForBooking(form: NewBookingForm, consentRequired: boolean): string | null {
  if (!form.name.trim()) return "checkin.need.name"
  if (!(form.arrive < form.depart)) return "booking.need.dates"
  if (form.source === "group" && form.units.length === 0) return "booking.need.units"
  if (form.source === "group" && !form.groupName.trim()) return "booking.need.groupName"
  if (!form.roomTypeId && form.units.length === 0) return "booking.need.units"
  if (consentRequired && !form.consent) return "checkin.need.consent"
  return null
}

/** Arrival and departure as full datetimes at the property's check-in/out times. */
export function stayWindow(
  form: NewBookingForm,
  checkinTime: string,
  checkoutTime: string,
): { arriveAt: string; departAt: string } | null {
  const a = atTime(form.arrive, checkinTime)
  const d = atTime(form.depart, checkoutTime)
  return a && d ? { arriveAt: toApiDateTime(a), departAt: toApiDateTime(d) } : null
}

export function buildReservation(
  form: NewBookingForm,
  window: { arriveAt: string; departAt: string },
  clientUuid: string,
): ReservationRequest {
  const corporate =
    form.source === "corporate" || form.source === "travel_agent" || form.source === "group"
  return {
    guestId: form.guest?.id ?? null,
    newGuest: form.guest
      ? null
      : {
          name: form.name.trim(),
          phone: digitsOnly(form.phone).slice(-10),
          city: form.city.trim(),
          address: "",
          nationality: "IN",
          idType: null,
          idLast4: null,
          notes: "",
        },
    roomTypeId: form.units.length ? null : form.roomTypeId,
    units: form.units.length ? form.units : null,
    arriveAt: window.arriveAt,
    departAt: window.departAt,
    adults: form.adults,
    children: form.children,
    purpose: "pilgrimage",
    notes: "",
    consent: form.consent,
    whatsappOptIn: form.whatsappOptIn,
    advancePaise: toPaise(form.advance),
    advanceMode: form.mode,
    source: form.source,
    tentative: form.tentative,
    details: {
      specialRequests: form.requests.trim() || null,
      groupName: form.source === "group" ? form.groupName.trim() || null : null,
      organization: corporate ? form.organization.trim() || null : null,
      billingGstin: form.source === "corporate" ? form.gstin.trim() || null : null,
    },
    clientUuid,
  }
}
