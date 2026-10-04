/** Bookings, as `/api/bookings/**` sends and receives them. Money is integer paise. */

export type BookingState =
  "pending" | "reserved" | "checked_in" | "checked_out" | "no_show" | "cancelled"
export type BookingSource =
  | "walk_in"
  | "phone"
  | "direct"
  | "travel_agent"
  | "corporate"
  | "group"
  | "other"
  | "website"
  | "ota"
export type PaymentStatus = "unpaid" | "partial" | "paid"
export type IdType = "aadhaar" | "voter" | "dl" | "passport" | "other"

export const DESK_SOURCES: BookingSource[] = [
  "phone",
  "direct",
  "travel_agent",
  "corporate",
  "group",
  "other",
]
export const ID_TYPES: IdType[] = ["aadhaar", "voter", "dl", "passport", "other"]

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

/** One of the party, for the register; unitId is the room or bed they sleep in. */
export type Member = {
  id: string | null
  name: string
  adult: boolean
  idType: IdType | null
  idLast4: string | null
  unitId: string | null
}

export type Booking = {
  id: string
  guestId: string
  guestName: string
  guestPhone: string
  state: BookingState
  source: BookingSource | string
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
  paymentStatus: PaymentStatus
  specialRequests: string | null
  groupName: string | null
  organization: string | null
  billingGstin: string | null
  holdUntil: string | null
}

/** A room or bed free for a whole stay (advisory: the database decides when it is taken). */
export type FreeUnit = {
  roomId: string
  bedId: string | null
  roomNumber: string
  bedLabel: string | null
  roomTypeId: string
  typeName: string
  ratePaise: number
  dormitory: boolean
  status: string
  building: string
  floor: number
}

export type Today = {
  date: string
  arrivals: Booking[]
  arrived: Booking[]
  inHouse: Booking[]
  departures: Booking[]
  flaggedNoShow: Booking[]
  booked: Booking[]
  cancelled: Booking[]
  freeByType: { type_name: string; free: number }[]
  channelConflicts: number
  totalUnits: number
  blockedUnits: number
  bookedUnits: number
}

export type TapeUnit = {
  room_id: string
  number: string
  floor: number
  status: string
  blocked_reason: string | null
  type_name: string
  is_dormitory: boolean
  bed_id: string | null
  label: string | null
}
export type TapeOccupancy = {
  unit_id: string
  room_id: string
  bed_id: string | null
  arrive_at: string
  depart_at: string
  booking_id: string
  state: BookingState
  source: string
  guest_name: string
}
export type TapeChart = {
  start: string
  days: number
  units: TapeUnit[]
  occupancy: TapeOccupancy[]
}

export type SearchHit = {
  id: string
  state: BookingState
  arriveAt: string
  departAt: string
  guestName: string
  phone: string
  units: string
}
export type Activity = { at: string; table: string; action: string; userName: string | null }

export type UnitRequest = { roomId: string; bedId: string | null; ratePaise: number | null }
export type GuestInput = {
  name: string
  phone: string
  city: string
  address: string
  nationality: string
  idType: IdType | null
  idLast4: string | null
  notes: string
  email?: string | null
  state?: string
  country?: string
  passportNo?: string | null
  visaNo?: string | null
  visaExpiry?: string | null
}
export type Details = {
  specialRequests: string | null
  groupName: string | null
  organization: string | null
  billingGstin: string | null
}
export type Approval = { approverId: string | null; pin: string | null }

export type CheckInRequest = {
  guestId: string | null
  newGuest: GuestInput | null
  units: UnitRequest[]
  nights: number
  adults: number
  children: number
  members: Member[] | null
  purpose: string
  notes: string
  consent: boolean
  whatsappOptIn: boolean
  idPhotoSkippedReason: string | null
  advancePaise: number
  advanceMode: string
  depositPaise: number
  clientUuid: string
}

export type ReservationRequest = {
  guestId: string | null
  newGuest: GuestInput | null
  roomTypeId: string | null
  units: UnitRequest[] | null
  arriveAt: string
  departAt: string
  adults: number
  children: number
  purpose: string
  notes: string
  consent: boolean
  whatsappOptIn: boolean
  advancePaise: number
  advanceMode: string
  source: BookingSource
  tentative: boolean
  details: Details
  clientUuid: string
}

export type CheckOutInput = Approval & { departAt: string | null; overrideReason: string | null }
export type ReasonInput = Approval & { reason: string }
export type MoveInput = {
  unitId: string | null
  roomId: string | null
  bedId: string | null
  arriveOn: string | null
}
export type DetailsInput = { details: Details; notes: string }
