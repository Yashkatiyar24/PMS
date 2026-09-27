import type { BookingState, GuestInput, IdType } from "@/features/bookings/types"

export type { GuestInput }

export type Guest = {
  id: string
  name: string
  phone: string
  city: string
  address: string
  nationality: string
  idType: IdType | null
  idLast4: string | null
  hasIdPhoto: boolean
  passportNo: string | null
  visaNo: string | null
  visaExpiry: string | null
  notes: string
  email: string | null
  state: string
  country: string
  hasPhoto: boolean
}

export type GuestStay = {
  bookingId: string
  state: BookingState
  arriveAt: string
  departAt: string
  units: string | null
  totalPaise: number
  paidPaise: number
  balancePaise: number
  source: string
}

export type GuestProfile = {
  guest: Guest
  current: GuestStay | null
  stays: GuestStay[]
  payments: {
    receivedAt: string
    mode: string
    amountPaise: number
    refund: boolean
    bookingId: string
  }[]
  visits: number
  nights: number
  spentPaise: number
  outstandingPaise: number
}

/** Self-registration: the desk makes a link, the guest fills it on their own phone. */
export type NewLink = { id: string; url: string; qrDataUri: string; expiresAt: string }
export type Submission = {
  name: string
  phone: string
  city: string
  address: string
  nationality: string
  idType: IdType | null
  idLast4: string | null
  passportNo: string | null
  adults: number
  children: number
  purpose: string
  members: { name: string; adult: boolean }[]
  consent: boolean
  whatsappOptIn: boolean
}
export type Registration = {
  id: string
  state: "open" | "submitted" | "applied" | "revoked"
  expiresAt: string
  submittedAt: string | null
  submitted: Submission | null
  hasIdPhoto: boolean
}
