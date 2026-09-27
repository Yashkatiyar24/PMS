import { digitsOnly, toPaise } from "@/utils/format"

import type { CheckInForm } from "../hooks/useCheckInForm"
import type { CheckInRequest } from "../types"

/** The web's check-in body, built from the form; `guestId` and `newGuest` are settled by the caller. */
export function buildCheckInRequest(form: CheckInForm, clientUuid: string): CheckInRequest {
  return {
    guestId: form.guest?.id ?? null,
    newGuest: {
      name: form.name.trim(),
      phone: digitsOnly(form.phone).slice(-10),
      city: form.city.trim(),
      address: form.address.trim(),
      nationality: "IN",
      idType: form.idLast4 ? form.idType : form.idType,
      idLast4: form.idLast4 || null,
      notes: "",
    },
    units: form.unit ? [form.unit] : [],
    nights: form.nights,
    adults: form.adults,
    children: form.children,
    members: null,
    purpose: "pilgrimage",
    notes: "",
    consent: form.consent,
    whatsappOptIn: form.whatsappOptIn,
    idPhotoSkippedReason:
      form.photo || form.registration?.hasIdPhoto || form.guest?.hasIdPhoto
        ? null
        : form.skipReason.trim() || null,
    advancePaise: toPaise(form.advance),
    advanceMode: form.mode,
    depositPaise: toPaise(form.deposit),
    clientUuid,
  }
}
