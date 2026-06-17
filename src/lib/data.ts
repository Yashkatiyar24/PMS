import type {
  Property, Room, Guest, Booking, HousekeepingTask,
  MaintenanceTicket, Invoice, AnalyticsData, Notification, CalendarEvent, ReservationTimeline, GuestTier
} from "./types"

const cities = [
  "New York", "Los Angeles", "Miami", "San Francisco", "Chicago",
  "Boston", "Austin", "Seattle", "Denver", "Nashville",
  "Portland", "Atlanta", "San Diego", "Las Vegas", "Houston",
  "Phoenix", "Philadelphia", "Dallas", "Orlando", "Minneapolis",
  "Tampa", "Charlotte", "Salt Lake City", "Santa Fe", "Savannah"
]

const propertyNames = [
  "The Penthouse at NoMad", "Soho Loft Residence", "Tribeca Sky Suite",
  "Central Park View", "Brooklyn Heights Estate", "Williamsburg Industrial Loft",
  "Upper East Side Manor", "Chelsea Art House", "Greenwich Village Townhouse",
  "DUMBO Waterfront Suite", "Pacific Heights Villa", "Marina Del Rey Penthouse",
  "Beverly Hills Estate", "Santa Monica Beach House", "Silver Lake Retreat",
  "Venice Canals Residence", "South Beach Penthouse", "Brickell Waterfront Tower",
  "Coral Gables Manor", "Key Biscayne Villa", "Presidio Heights Estate",
  "Russian Hill Penthouse", "SoMa Innovation Suite", "Mission District Loft",
  "Nob Hill Classic"
]

const hotelNames = [
  "NoMad Tower", "Soho Grand", "Tribeca Heights",
  "Central Park Residence", "Brooklyn Manor", "Williamsburg Club",
  "East Side Collection", "Chelsea Townhouses", "Greenwich Suites",
  "DUMBO Waterfront", "Pacific Residence", "Marina Tower",
  "Beverly Collection", "Santa Monica Resort", "Silver Lake Boutique",
  "Venice Suites", "South Beach Club", "Brickell Residences",
  "Coral Gables Hotel", "Key Biscayne Resort", "Presidio Collection",
  "Russian Hill Suites", "SoMa Tech Residences", "Mission Hotel",
  "Nob Hill Grand"
]

const guestFirstNames = [
  "James", "Emma", "Lucas", "Sophia", "Oliver", "Isabella", "William",
  "Mia", "Henry", "Charlotte", "Alexander", "Amelia", "Daniel", "Harper",
  "Michael", "Evelyn", "Sebastian", "Abigail", "Joseph", "Emily",
  "David", "Ella", "Andrew", "Avery", "Matthew", "Scarlett", "Jack",
  "Grace", "Samuel", "Chloe", "Ryan", "Victoria", "Nathan", "Riley",
  "Christian", "Aria", "Jonathan", "Lily", "Christopher", "Aurora",
  "Dylan", "Zoey", "Aaron", "Nora", "Cameron", "Camila", "Adrian", "Penelope"
]

const guestLastNames = [
  "Anderson", "Chen", "Williams", "Patel", "Johnson", "Kim", "Brown",
  "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Wilson", "Taylor",
  "Thomas", "Jackson", "White", "Harris", "Clark", "Lewis", "Robinson",
  "Walker", "Young", "Allen", "King", "Wright", "Scott", "Hill",
  "Adams", "Baker", "Nelson", "Carter", "Mitchell", "Turner", "Phillips",
  "Campbell", "Parker", "Evans", "Edwards", "Collins", "Stewart", "Morris",
  "Murphy", "Cook", "Rogers", "Morgan", "Peterson", "Cooper"
]

const roomTypes = ["Penthouse Suite", "Executive Suite", "Deluxe Room", "Premium Room", "Studio Suite", "Loft Suite", "Garden Suite", "Corner Suite", "Presidential Suite", "Junior Suite"]

const amenities = [
  "Pool", "Gym", "Rooftop Terrace", "Concierge", "Valet Parking",
  "Spa Access", "Private Balcony", "Smart Home", "Rain Shower",
  "Italian Marble Floors", "Walk-in Closet", "Wine Cellar",
  "Home Theater", "Library", "Chef's Kitchen", "Infinity Pool",
  "Private Elevator", "Butler Service", "Courtyard Garden", "Fireplace"
]

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomItems<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => 0.5 - Math.random())
  return shuffled.slice(0, count)
}

function randomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

export const properties: Property[] = Array.from({ length: 25 }, (_, i) => ({
  id: `prop-${i + 1}`,
  name: propertyNames[i],
  city: cities[i],
  country: "United States",
  image: `https://images.unsplash.com/photo-${[
    "1600596542815-ffad4c1539a9",
    "1600607687939-ce8a6c25118c",
    "1600585154340-be6161a56a0c",
    "1600607687644-aac4c3eac7f4",
    "1600566753376-12c8ab7c1a5b",
    "1600573472556-e6356c7f0c1b",
    "1600585152913-d6ec865b07f6",
    "1600566753190-17f0baa2a6c3",
    "1600573472592-401b489a3cdc",
    "1600566753376-12c8ab7c1a5b",
    "1600585154340-be6161a56a0c",
    "1600607687939-ce8a6c25118c",
    "1600596542815-ffad4c1539a9",
    "1600607687644-aac4c3eac7f4",
    "1600566753376-12c8ab7c1a5b",
    "1600573472556-e6356c7f0c1b",
    "1600585152913-d6ec865b07f6",
    "1600566753190-17f0baa2a6c3",
    "1600573472592-401b489a3cdc",
    "1600566753376-12c8ab7c1a5b",
    "1600585154340-be6161a56a0c",
    "1600607687939-ce8a6c25118c",
    "1600596542815-ffad4c1539a9",
    "1600607687644-aac4c3eac7f4",
    "1600566753376-12c8ab7c1a5b"
  ][i]}?w=800&h=600&fit=crop`,
  rooms: randomNumber(8, 25),
  status: Math.random() > 0.1 ? "active" : "active",
  revenue: randomNumber(45000, 350000),
  occupancy: randomNumber(60, 98),
  activeBookings: randomNumber(2, 18),
  rating: +(4.0 + Math.random()).toFixed(1),
  amenities: randomItems(amenities, randomNumber(4, 8)),
  description: `A stunning ${propertyNames[i].toLowerCase()} featuring world-class amenities and breathtaking views of ${cities[i]}.`
}))

export const rooms: Room[] = properties.flatMap((prop) => {
  const roomCount = prop.rooms
  return Array.from({ length: roomCount }, (_, i) => {
    const statuses: Room["status"][] = ["available", "occupied", "reserved", "dirty", "cleaning", "maintenance"]
    const weights = [0.35, 0.30, 0.15, 0.08, 0.07, 0.05]
    let r = Math.random()
    let cumulative = 0
    let status = statuses[0]
    for (let j = 0; j < statuses.length; j++) {
      cumulative += weights[j]
      if (r <= cumulative) { status = statuses[j]; break }
    }

    return {
      id: `room-${prop.id}-${i + 1}`,
      propertyId: prop.id,
      number: `${i + 1}`.padStart(3, "0"),
      name: `${randomItem(roomTypes)} ${String.fromCharCode(65 + i % 26)}`,
      type: randomItem(roomTypes),
      floor: Math.floor(i / 3) + 1,
      status,
      price: randomNumber(250, 2500),
      capacity: randomNumber(2, 6),
      amenities: randomItems(amenities, randomNumber(3, 6)),
      image: `https://images.unsplash.com/photo-${["1611892440504-42a792e24d32", "1631049307264-da0a9ce8f76b", "1615571022219-6a45d0a7f3f2", "1560448204-e02f11c3d0e2", "1522708325809-b4e4e6b1d5b8", "1586023492125-6f2e4d0f2e3d"][i % 6]}?w=400&h=300&fit=crop`,
      cleaningStatus: randomItem(["pending", "in-progress", "completed", "inspected"] as const),
      lastCleaned: new Date(Date.now() - randomNumber(0, 7) * 86400000).toISOString(),
    }
  })
})

export const guests: Guest[] = Array.from({ length: 48 }, (_, i) => {
  const firstName = guestFirstNames[i]
  const lastName = guestLastNames[i]
  const tiers: GuestTier[] = ["platinum", "gold", "silver", "bronze"]
  return {
    id: `guest-${i + 1}`,
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@email.com`,
    phone: `+1 (${randomNumber(200, 999)}) ${randomNumber(200, 999)}-${randomNumber(1000, 9999)}`,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${firstName}${lastName}`,
    tier: tiers[Math.floor(i / 12)],
    totalSpent: randomNumber(2000, 85000),
    totalBookings: randomNumber(2, 25),
    memberSince: new Date(Date.now() - randomNumber(90, 1095) * 86400000).toISOString(),
    preferences: randomItems(["Late checkout", "Extra pillows", "Welcome amenities", "Corner room", "High floor", "Quiet floor", "Ocean view", "City view", "Pet friendly", "Non-smoking", "Eco-friendly"], randomNumber(2, 5)),
    notes: "",
    idVerified: Math.random() > 0.15,
    nationality: randomItem(["American", "British", "Canadian", "Australian", "German", "French", "Japanese", "Brazilian", "Swiss", "Italian"]),
    dateOfBirth: new Date(randomNumber(1960, 2000), randomNumber(0, 11), randomNumber(1, 28)).toISOString(),
  }
})

export const bookings: Booking[] = Array.from({ length: 65 }, (_, i) => {
  const guest = guests[i % guests.length]
  const prop = properties[i % properties.length]
  const room = rooms.filter(r => r.propertyId === prop.id)[i % prop.rooms]
  const checkIn = new Date()
  checkIn.setDate(checkIn.getDate() + randomNumber(-5, 14))
  const checkOut = new Date(checkIn)
  checkOut.setDate(checkIn.getDate() + randomNumber(1, 7))
  const statuses: Booking["status"][] = ["confirmed", "checked_in", "checked_out", "cancelled"]
  const status = i < 15 ? "checked_in" : i < 30 ? "confirmed" : i < 50 ? "checked_out" : "cancelled"
  const amount = randomNumber(500, 15000)

  return {
    id: `BKG-${String(i + 1).padStart(4, "0")}`,
    propertyId: prop.id,
    roomId: room.id,
    roomNumber: room.number,
    guestId: guest.id,
    guestName: `${guest.firstName} ${guest.lastName}`,
    guestAvatar: guest.avatar,
    guestEmail: guest.email,
    checkIn: checkIn.toISOString(),
    checkOut: checkOut.toISOString(),
    status,
    totalAmount: amount,
    paidAmount: status === "cancelled" ? amount * 0.3 : amount,
    source: randomItem(["Airbnb", "Booking.com", "Direct", "Expedia", "VRBO", "Corporate"]),
    adults: randomNumber(1, 4),
    children: randomNumber(0, 3),
    specialRequests: Math.random() > 0.7 ? randomItem(["Late check-in around 10pm", "Anniversary celebration setup", "Extra crib for toddler", "Airport transfer needed", "Allergy-friendly room"]) : "",
    createdAt: new Date(Date.now() - randomNumber(1, 90) * 86400000).toISOString(),
  }
})

export const housekeepingTasks: HousekeepingTask[] = rooms.filter(r => r.status === "dirty" || r.status === "cleaning" || Math.random() > 0.7).slice(0, 30).map((room, i) => {
  const cleaners = ["Maria Santos", "James Wilson", "Priya Sharma", "Carlos Mendez", "Sarah Chen", "David Kim", "Ana Rodriguez", "Michael Brown"]
  const statuses: HousekeepingTask["status"][] = ["pending", "in-progress", "completed", "inspected"]
  return {
    id: `hk-${i + 1}`,
    roomId: room.id,
    roomNumber: room.number,
    propertyId: room.propertyId,
    propertyName: properties.find(p => p.id === room.propertyId)?.name || "",
    cleaner: cleaners[i % cleaners.length],
    cleanerAvatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleaners[i % cleaners.length].replace(" ", "")}`,
    status: statuses[i % 4],
    priority: randomItem(["low", "medium", "high"] as const),
    eta: `${randomNumber(8, 17)}:${randomNumber(0, 5) * 10}`.padStart(5, "0"),
    progress: statuses[i % 4] === "completed" ? 100 : statuses[i % 4] === "in-progress" ? randomNumber(30, 70) : 0,
    notes: randomItem(["Deep clean requested", "Restock mini bar", "Replace linens", "Standard turn-over", "Extra amenities needed", ""]),
    scheduledDate: new Date(Date.now() + randomNumber(-1, 3) * 86400000).toISOString(),
  }
})

export const maintenanceTickets: MaintenanceTicket[] = [
  { id: "MT-1001", title: "AC not cooling properly", description: "Guest reported AC unit making noise and not cooling below 75°F", propertyId: "prop-1", propertyName: "The Penthouse at NoMad", roomId: "room-prop-1-1", roomNumber: "001", status: "in-progress", priority: "high", assignedTo: "Robert HVAC", assignedAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=RobertHVAC", estimatedCompletion: "2026-06-18T15:00:00Z", createdAt: "2026-06-16T10:30:00Z", resolvedAt: null, images: [], category: "HVAC", cost: 0 },
  { id: "MT-1002", title: "Leaking faucet in bathroom", description: "Persistent drip from master bathroom sink", propertyId: "prop-3", propertyName: "Tribeca Sky Suite", roomId: "room-prop-3-2", roomNumber: "002", status: "open", priority: "medium", assignedTo: "Maria Plumber", assignedAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=MariaPlumber", estimatedCompletion: "2026-06-19T12:00:00Z", createdAt: "2026-06-15T14:00:00Z", resolvedAt: null, images: [], category: "Plumbing", cost: 0 },
  { id: "MT-1003", title: "TV not working", description: "Smart TV won't turn on, power outlet seems fine", propertyId: "prop-5", propertyName: "Brooklyn Heights Estate", roomId: "room-prop-5-1", roomNumber: "001", status: "resolved", priority: "low", assignedTo: "Alex Tech", assignedAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=AlexTech", estimatedCompletion: "2026-06-17T11:00:00Z", createdAt: "2026-06-14T09:00:00Z", resolvedAt: "2026-06-17T10:30:00Z", images: [], category: "Electronics", cost: 150 },
  { id: "MT-1004", title: "Door lock malfunction", description: "Electronic keypad not responding, guest locked out", propertyId: "prop-2", propertyName: "Soho Loft Residence", roomId: "room-prop-2-3", roomNumber: "003", status: "closed", priority: "critical", assignedTo: "Sam Locksmith", assignedAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=SamLocksmith", estimatedCompletion: "2026-06-16T09:00:00Z", createdAt: "2026-06-16T08:00:00Z", resolvedAt: "2026-06-16T08:45:00Z", images: [], category: "Security", cost: 200 },
  { id: "MT-1005", title: "Water pressure low", description: "Shower water pressure below acceptable levels", propertyId: "prop-7", propertyName: "Upper East Side Manor", roomId: "room-prop-7-4", roomNumber: "004", status: "open", priority: "high", assignedTo: "Maria Plumber", assignedAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=MariaPlumber", estimatedCompletion: "2026-06-20T14:00:00Z", createdAt: "2026-06-17T11:00:00Z", resolvedAt: null, images: [], category: "Plumbing", cost: 0 },
  { id: "MT-1006", title: "Broken window blinds", description: "Motorized blinds stuck in open position", propertyId: "prop-4", propertyName: "Central Park View", roomId: "room-prop-4-2", roomNumber: "002", status: "open", priority: "low", assignedTo: "Unassigned", assignedAvatar: "", estimatedCompletion: "", createdAt: "2026-06-17T16:30:00Z", resolvedAt: null, images: [], category: "Maintenance", cost: 0 },
  { id: "MT-1007", title: "Pool heater repair", description: "Pool temperature dropped below 78°F, heater not igniting", propertyId: "prop-10", propertyName: "DUMBO Waterfront Suite", roomId: "room-prop-10-1", roomNumber: "001", status: "in-progress", priority: "critical", assignedTo: "Robert HVAC", assignedAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=RobertHVAC", estimatedCompletion: "2026-06-18T18:00:00Z", createdAt: "2026-06-15T07:00:00Z", resolvedAt: null, images: [], category: "HVAC", cost: 0 },
]

export const invoices: Invoice[] = bookings.slice(0, 20).map((booking, i) => {
  const tax = Math.round(booking.totalAmount * 0.12)
  const deposit = Math.round(booking.totalAmount * 0.2)
  return {
    id: `INV-${String(i + 1).padStart(4, "0")}`,
    guestId: booking.guestId,
    guestName: booking.guestName,
    bookingId: booking.id,
    amount: booking.totalAmount,
    tax,
    deposit,
    total: booking.totalAmount + tax,
    status: randomItem(["paid", "pending", "refunded"] as const),
    issuedDate: new Date(Date.now() - randomNumber(1, 30) * 86400000).toISOString(),
    paidDate: Math.random() > 0.3 ? new Date(Date.now() - randomNumber(0, 5) * 86400000).toISOString() : null,
    items: [
      { description: "Room Charges", quantity: randomNumber(2, 7), unitPrice: Math.round(booking.totalAmount / 3), total: Math.round(booking.totalAmount * 0.7) },
      { description: "Service Fees", quantity: 1, unitPrice: Math.round(booking.totalAmount * 0.15), total: Math.round(booking.totalAmount * 0.15) },
      { description: "Amenities & Extras", quantity: 1, unitPrice: Math.round(booking.totalAmount * 0.15), total: Math.round(booking.totalAmount * 0.15) },
    ],
  }
})

export const analyticsData: AnalyticsData[] = [
  { month: "Jan", revenue: 142000, occupancy: 72, bookings: 38, adr: 425, revpar: 306 },
  { month: "Feb", revenue: 138000, occupancy: 68, bookings: 35, adr: 410, revpar: 279 },
  { month: "Mar", revenue: 165000, occupancy: 78, bookings: 45, adr: 445, revpar: 347 },
  { month: "Apr", revenue: 182000, occupancy: 82, bookings: 52, adr: 468, revpar: 384 },
  { month: "May", revenue: 198000, occupancy: 85, bookings: 55, adr: 490, revpar: 417 },
  { month: "Jun", revenue: 225000, occupancy: 91, bookings: 62, adr: 520, revpar: 473 },
  { month: "Jul", revenue: 248000, occupancy: 94, bookings: 68, adr: 545, revpar: 512 },
  { month: "Aug", revenue: 235000, occupancy: 90, bookings: 60, adr: 530, revpar: 477 },
  { month: "Sep", revenue: 210000, occupancy: 86, bookings: 56, adr: 505, revpar: 434 },
  { month: "Oct", revenue: 178000, occupancy: 80, bookings: 48, adr: 475, revpar: 380 },
  { month: "Nov", revenue: 155000, occupancy: 74, bookings: 42, adr: 445, revpar: 329 },
  { month: "Dec", revenue: 195000, occupancy: 88, bookings: 58, adr: 510, revpar: 449 },
]

export const notifications: Notification[] = [
  { id: "n1", type: "check-in", message: "James Anderson checked in at The Penthouse at NoMad", timestamp: new Date(Date.now() - 1800000).toISOString(), read: false, priority: "medium" },
  { id: "n2", type: "check-out", message: "Sophia Chen checked out from Soho Loft Residence", timestamp: new Date(Date.now() - 3600000).toISOString(), read: false, priority: "medium" },
  { id: "n3", type: "cleaning", message: "Room 304 at Tribeca Sky Suite is ready for inspection", timestamp: new Date(Date.now() - 7200000).toISOString(), read: false, priority: "low" },
  { id: "n4", type: "maintenance", message: "Critical: AC repair needed at The Penthouse at NoMad", timestamp: new Date(Date.now() - 10800000).toISOString(), read: true, priority: "high" },
  { id: "n5", type: "booking", message: "New booking: Central Park View - 5 nights starting Jun 20", timestamp: new Date(Date.now() - 14400000).toISOString(), read: true, priority: "low" },
  { id: "n6", type: "payment", message: "Payment received: $4,230 from Oliver Williams", timestamp: new Date(Date.now() - 18000000).toISOString(), read: true, priority: "medium" },
  { id: "n7", type: "check-in", message: "Emma Davis arrived early at Beverly Hills Estate", timestamp: new Date(Date.now() - 21600000).toISOString(), read: false, priority: "high" },
  { id: "n8", type: "booking", message: "Booking cancelled: Marina Del Rey Penthouse - refund processed", timestamp: new Date(Date.now() - 25200000).toISOString(), read: false, priority: "medium" },
]

export const calendarEvents: CalendarEvent[] = bookings.slice(0, 40).map((booking, i) => ({
  id: booking.id,
  title: `${booking.guestName} - ${booking.roomNumber}`,
  roomId: booking.roomId,
  roomNumber: booking.roomNumber,
  propertyId: booking.propertyId,
  guestName: booking.guestName,
  checkIn: new Date(booking.checkIn),
  checkOut: new Date(booking.checkOut),
  status: booking.status,
  color: ["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6"][i % 5],
}))

export function getReservationTimeline(bookingId: string): ReservationTimeline[] {
  return [
    { id: "t1", action: "Booking Created", user: "System", timestamp: new Date(Date.now() - 86400000).toISOString(), description: "Online booking via Airbnb" },
    { id: "t2", action: "Payment Confirmed", user: "System", timestamp: new Date(Date.now() - 43200000).toISOString(), description: "Full payment received" },
    { id: "t3", action: "Pre-arrival Note", user: "Concierge", timestamp: new Date(Date.now() - 21600000).toISOString(), description: "Welcome amenities arranged" },
    { id: "t4", action: "Checked In", user: "Front Desk", timestamp: new Date(Date.now() - 7200000).toISOString(), description: "Digital key sent" },
  ]
}

export const todayOccupancy = rooms.filter(r => r.status === "occupied").length
export const totalRooms = rooms.length
export const occupancyRate = Math.round((todayOccupancy / totalRooms) * 100)
export const todayRevenue = 28450
export const monthlyRevenue = 548000
export const activeGuests = bookings.filter(b => b.status === "checked_in").length
export const checkInsToday = 8
export const checkOutsToday = 6
export const pendingCleaning = rooms.filter(r => r.status === "dirty").length
export const availableRooms = rooms.filter(r => r.status === "available").length
export const maintenanceRequests = maintenanceTickets.filter(t => t.status === "open" || t.status === "in-progress").length
