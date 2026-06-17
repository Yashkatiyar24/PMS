export type PropertyStatus = "active" | "maintenance" | "inactive"
export type RoomStatus = "available" | "occupied" | "reserved" | "dirty" | "cleaning" | "maintenance"
export type BookingStatus = "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no-show"
export type HousekeepingStatus = "pending" | "in-progress" | "completed" | "inspected"
export type MaintenancePriority = "low" | "medium" | "high" | "critical"
export type GuestTier = "bronze" | "silver" | "gold" | "platinum"

export interface Property {
  id: string
  name: string
  city: string
  country: string
  image: string
  rooms: number
  status: PropertyStatus
  revenue: number
  occupancy: number
  activeBookings: number
  rating: number
  amenities: string[]
  description: string
}

export interface Room {
  id: string
  propertyId: string
  number: string
  name: string
  type: string
  floor: number
  status: RoomStatus
  price: number
  capacity: number
  amenities: string[]
  image: string
  cleaningStatus: HousekeepingStatus
  lastCleaned: string
}

export interface Guest {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  avatar: string
  tier: GuestTier
  totalSpent: number
  totalBookings: number
  memberSince: string
  preferences: string[]
  notes: string
  idVerified: boolean
  nationality: string
  dateOfBirth: string
}

export interface Booking {
  id: string
  propertyId: string
  roomId: string
  roomNumber: string
  guestId: string
  guestName: string
  guestAvatar: string
  guestEmail: string
  checkIn: string
  checkOut: string
  status: BookingStatus
  totalAmount: number
  paidAmount: number
  source: string
  adults: number
  children: number
  specialRequests: string
  createdAt: string
}

export interface ReservationTimeline {
  id: string
  action: string
  timestamp: string
  user: string
  description: string
}

export interface HousekeepingTask {
  id: string
  roomId: string
  roomNumber: string
  propertyId: string
  propertyName: string
  cleaner: string
  cleanerAvatar: string
  status: HousekeepingStatus
  priority: MaintenancePriority
  eta: string
  progress: number
  notes: string
  scheduledDate: string
}

export interface MaintenanceTicket {
  id: string
  title: string
  description: string
  propertyId: string
  propertyName: string
  roomId: string
  roomNumber: string
  status: "open" | "in-progress" | "resolved" | "closed"
  priority: MaintenancePriority
  assignedTo: string
  assignedAvatar: string
  estimatedCompletion: string
  createdAt: string
  resolvedAt: string | null
  images: string[]
  category: string
  cost: number
}

export interface Invoice {
  id: string
  guestId: string
  guestName: string
  bookingId: string
  amount: number
  tax: number
  deposit: number
  total: number
  status: "paid" | "pending" | "refunded" | "cancelled"
  issuedDate: string
  paidDate: string | null
  items: InvoiceItem[]
}

export interface InvoiceItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export interface AnalyticsData {
  month: string
  revenue: number
  occupancy: number
  bookings: number
  adr: number
  revpar: number
}

export interface Notification {
  id: string
  type: "check-in" | "check-out" | "cleaning" | "maintenance" | "booking" | "payment"
  message: string
  timestamp: string
  read: boolean
  priority: "low" | "medium" | "high"
}

export interface CalendarEvent {
  id: string
  title: string
  roomId: string
  roomNumber: string
  propertyId: string
  guestName: string
  checkIn: Date
  checkOut: Date
  status: BookingStatus
  color: string
}
