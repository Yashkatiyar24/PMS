/** Rooms, room types and housekeeping, as `/api/rooms`, `/api/room-types` send them. */

export type RoomStatus = "clean" | "dirty" | "cleaning" | "inspected" | "blocked" | "maintenance"
export const OFF_SALE: RoomStatus[] = ["blocked", "maintenance"]
export type HkPriority = "low" | "normal" | "high"

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

export type RoomTypeInput = Omit<RoomType, "id">

/** Who is in a unit now: a guest in the house, or a reservation arriving before tonight is over. */
export type Occupancy = {
  state: "occupied" | "reserved"
  bookingId: string
  guestName: string
  departAt: string
}

export type Bed = { id: string; label: string; active: boolean; occupancy: Occupancy | null }

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
  beds: Bed[]
  building: string
  housekeeperId: string | null
  housekeeperName: string | null
  hkPriority: HkPriority
  hkNote: string
  occupancy: Occupancy | null
}

export type RoomInput = {
  roomTypeId: string
  number: string
  floor: number
  active: boolean
  building: string
}
export type BulkRoomsInput = { roomTypeId: string; range: string; floor: number; building: string }
export type StatusInput = { status: RoomStatus; reason: string | null; until: string | null }
export type HousekeepingInput = { housekeeperId: string | null; priority: HkPriority; note: string }
export type Person = { id: string; name: string; role: string }
