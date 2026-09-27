import { useState } from "react"

import type { Guest, Registration, Submission } from "@/features/guests/types"
import type { PickedFile } from "@/utils/image"

import type { IdType, UnitRequest } from "../types"

export type CheckInForm = {
  phone: string
  name: string
  guest: Guest | null
  idType: IdType
  idLast4: string
  address: string
  city: string
  photo: PickedFile | null
  skipReason: string
  adults: number
  children: number
  nights: number
  roomTypeId: string | null
  unit: UnitRequest | null
  unitLabel: string
  advance: string
  deposit: string
  mode: string
  consent: boolean
  whatsappOptIn: boolean
  registration: { id: string; hasIdPhoto: boolean } | null
}

export function useCheckInForm(defaults: { depositPaise: number; mode: string }) {
  const [form, setForm] = useState<CheckInForm>({
    phone: "",
    name: "",
    guest: null,
    idType: "voter",
    idLast4: "",
    address: "",
    city: "",
    photo: null,
    skipReason: "",
    adults: 1,
    children: 0,
    nights: 1,
    roomTypeId: null,
    unit: null,
    unitLabel: "",
    advance: "",
    deposit: defaults.depositPaise ? String(defaults.depositPaise / 100) : "",
    mode: defaults.mode,
    consent: false,
    whatsappOptIn: false,
    registration: null,
  })
  const patch = (p: Partial<CheckInForm>) => setForm((f) => ({ ...f, ...p }))

  /** What the guest typed on their own phone fills the form; the desk can still correct it. */
  const applySubmission = (s: Submission, reg: Registration) =>
    patch({
      name: s.name,
      phone: s.phone,
      city: s.city,
      address: s.address,
      idType: s.idType ?? "other",
      idLast4: s.idLast4 ?? "",
      adults: Math.max(1, s.adults),
      children: s.children,
      consent: s.consent,
      whatsappOptIn: s.whatsappOptIn,
      guest: null,
      registration: { id: reg.id, hasIdPhoto: reg.hasIdPhoto },
    })

  return { form, patch, applySubmission }
}

/** The first thing still missing, in the order the web checks; null when the form can be sent. */
export function missingStep(
  form: CheckInForm,
  rules: { consentRequired: boolean; photoRequired: boolean },
): string | null {
  if (!form.name.trim()) return "checkin.need.name"
  if (!form.unit) return "checkin.need.room"
  if (rules.consentRequired && !form.consent) return "checkin.need.consent"
  const hasPhoto = !!form.photo || !!form.registration?.hasIdPhoto || !!form.guest?.hasIdPhoto
  if (rules.photoRequired && !hasPhoto && !form.skipReason.trim()) return "checkin.need.photo"
  return null
}
