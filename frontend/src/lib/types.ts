/** What the API returns. Kept in one file so a backend change surfaces as a type error, not a runtime one. */

/** "pending" holds rooms without being confirmed (awaiting payment, or a tentative hold) and lapses at holdUntil. */
export type BookingState = "pending" | "reserved" | "checked_in" | "checked_out" | "no_show" | "cancelled"

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
  members: Member[]
  createdAt: string
  totalPaise: number
  paidPaise: number
  paymentStatus: "unpaid" | "partial" | "paid"
  specialRequests: string
  groupName: string | null
  organization: string | null
  billingGstin: string | null
  holdUntil: string | null
}

/** One of the party, for the register; unitId is the room or bed they sleep in. */
export type Member = { id: string | null; name: string; adult: boolean; idType: string | null; idLast4: string | null; unitId: string | null }

/** A room or bed free for a whole stay (advisory: the database decides when it is taken). */
export type FreeUnit = {
  roomId: string; bedId: string | null; roomNumber: string; bedLabel: string | null; roomTypeId: string; typeName: string
  ratePaise: number; dormitory: boolean; status: string; building: string; floor: number
}

/** Sources the desk can pick; "website" and "ota" make their own bookings. */
export const DESK_SOURCES = ["phone", "direct", "travel_agent", "corporate", "group", "other"] as const

export type Today = {
  date: string
  arrivals: Booking[]
  inHouse: Booking[]
  departures: Booking[]
  flaggedNoShow: Booking[]
  freeByType: { type_name: string; free: number }[]
  /** OTA stays that could not be placed because the room is taken here. */
  channelConflicts: number
  /** Checked in today, already done. */
  arrived: Booking[]
  /** Made today, and cancelled today. */
  booked: Booking[]
  cancelled: Booking[]
  /** Tonight: every unit, those out of service, and those a live stay holds. */
  totalUnits: number
  blockedUnits: number
  bookedUnits: number
}

export type Forecast = {
  from: string
  to: string
  units: number
  roomNights: number
  occupancyPct: number
  adrPaise: number
  revparPaise: number
  revenuePaise: number
  nights: { date: string; sold: number; revenuePaise: number; occupancyPct: number }[]
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
  amenities: string[]
}

/** Housekeeping's word for a room. Occupied, reserved and available come from the bookings instead. */
export type RoomStatus = "clean" | "dirty" | "cleaning" | "inspected" | "blocked" | "maintenance"

/** Who is in a unit now: a guest in the house, or a reservation arriving before tonight is over. */
export type Occupancy = { state: "occupied" | "reserved"; bookingId: string; guestName: string; departAt: string }

export type Room = {
  id: string
  roomTypeId: string
  roomTypeName: string
  number: string
  floor: number
  status: RoomStatus
  blockedReason: string | null
  blockedUntil: string | null
  active: boolean
  beds: { id: string; label: string; active: boolean; occupancy: Occupancy | null }[]
  building: string
  housekeeperId: string | null
  housekeeperName: string | null
  hkPriority: "low" | "normal" | "high"
  hkNote: string
  /** Set for an ordinary room when taken, and for a dormitory only when the whole room is. */
  occupancy: Occupancy | null
}

export const OFF_SALE: RoomStatus[] = ["blocked", "maintenance"]

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
  email: string | null
  state: string
  country: string
  hasPhoto: boolean
}

export type GuestProfile = {
  guest: Guest
  current: GuestStay | null
  stays: GuestStay[]
  payments: { receivedAt: string; mode: string; amountPaise: number; refund: boolean; bookingId: string }[]
  visits: number
  nights: number
  spentPaise: number
  outstandingPaise: number
}
export type GuestStay = { bookingId: string; state: BookingState; arriveAt: string; departAt: string; units: string | null; totalPaise: number; paidPaise: number; balancePaise: number; source: string }

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
  igstPaise: number
  category: string | null
}

/** What an extra charge is for. */
export const CHARGE_CATEGORIES = ["food", "restaurant", "laundry", "room_service", "extra_bed", "transport", "other"] as const

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
