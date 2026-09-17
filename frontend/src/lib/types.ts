/** What the API returns. Kept in one file so a backend change surfaces as a type error, not a runtime one. */

export type BookingState = "reserved" | "checked_in" | "checked_out" | "no_show" | "cancelled"

export type BookingUnit = {
  id: string
  roomId: string
  roomNumber: string
  bedId: string | null
  bedLabel: string | null
  ratePaise: number
  arriveAt: string
  departAt: string
  autoAssigned: boolean
}

export type Booking = {
  id: string
  guestId: string
  guestName: string
  guestPhone: string
  state: BookingState
  source: string
  arriveAt: string
  departAt: string
  checkedInAt: string | null
  checkedOutAt: string | null
  adults: number
  children: number
  memberCount: number
  purpose: string
  notes: string
  consentAt: string | null
  whatsappOptIn: boolean
  flaggedNoshowAt: string | null
  cancelReason: string | null
  folioId: string | null
  balanceDuePaise: number
  units: BookingUnit[]
  members: { id: string; name: string; adult: boolean; idType: string | null; idLast4: string | null }[]
}

export type Today = {
  date: string
  arrivals: Booking[]
  inHouse: Booking[]
  departures: Booking[]
  flaggedNoShow: Booking[]
  freeByType: { type_name: string; free: number }[]
}

export type RoomType = {
  id: string
  name: string
  baseRatePaise: number
  maxOccupancy: number
  extraPersonPaise: number
  dormitory: boolean
  bedCount: number
  sortOrder: number
  active: boolean
}

export type Room = {
  id: string
  roomTypeId: string
  roomTypeName: string
  number: string
  floor: number
  status: "clean" | "dirty" | "blocked"
  blockedReason: string | null
  blockedUntil: string | null
  active: boolean
  beds: { id: string; label: string; active: boolean }[]
}

export type Guest = {
  id: string
  name: string
  phone: string
  city: string
  address: string
  nationality: string
  idType: string | null
  idLast4: string | null
  hasIdPhoto: boolean
  passportNo: string | null
  visaNo: string | null
  visaExpiry: string | null
  notes: string
}

export type FolioLine = {
  id: string
  kind: string
  description: string
  qty: number
  unitPaise: number
  taxRateBp: number
  cgstPaise: number
  sgstPaise: number
  lineDate: string
  auto: boolean
  reason: string | null
}

export type Folio = {
  id: string
  bookingId: string
  status: "open" | "settled" | "written_off"
  totalPaise: number
  taxPaise: number
  paidPaise: number
  depositHeldPaise: number
  lines: FolioLine[]
  payments: {
    id: string
    mode: string
    amountPaise: number
    reference: string
    refund: boolean
    reason: string | null
    receivedAt: string
  }[]
}

export type Receipt = {
  id: string
  folioId: string
  kind: "invoice" | "donation" | "credit_note" | "provisional"
  number: string
  fy: string
  amountPaise: number
  issuedAt: string
  pdfKey: string | null
}

/** The settings registry, as the backend describes it. The settings screen is built from this. */
export type SettingDef = {
  key: string
  group: string
  type: "BOOL" | "INT" | "TIME" | "ENUM" | "TEXT" | "LIST" | "I18N_TEXT"
  defaultValue: unknown
  who: "MANAGER" | "OWNER" | "SUPER_ADMIN"
  options: string[] | null
  min: number | null
  max: number | null
  maxLength: number | null
  description: string
}
