export type Daily = {
  businessDate: string
  collections: { mode: string; amount: number; count: number }[]
  collectedPaise: number
  cashByUser: { name: string; amount: number }[]
  arrivals: number
  departures: number
  noShows: number
  occupiedUnits: number
  sellableUnits: number
  occupancyPct: number
  outstandingCount: number
  outstandingPaise: number
  depositsHeldPaise: number
}

export type Outstanding = {
  folio_id: string
  booking_id: string
  guest_name: string
  phone: string
  due_paise: number
  arrive_at: string
}
export type CashInHand = {
  user_id: string
  name: string
  cash_paise: number
  last_handover_at: string | null
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

export type PeriodReport = {
  from: string
  to: string
  days: number
  occupancy: {
    units: number
    availableNights: number
    nightsSold: number
    occupancyPct: number
    roomRevenuePaise: number
    adrPaise: number
    revparPaise: number
  }
  revenue: {
    lines: { item: string; taxable: number; tax: number }[]
    totalPaise: number
    taxPaise: number
  }
  tax: { tax_rate_bp: number; taxable: number; cgst: number; sgst: number; igst: number }[]
  bookings: {
    made: number
    arrivals: number
    departures: number
    cancellations: number
    noShows: number
  }
  sources: { source: string; bookings: number; nights: number; billed: number }[]
  payments: { mode: string; received: number; refunded: number; count: number }[]
  outstanding: { count: number; amountPaise: number }
  expenses: { byCategory: { category: string; amount: number }[]; totalPaise: number }
  net: { revenuePaise: number; expensesPaise: number; netPaise: number }
  housekeeping: {
    status: { status: string; rooms: number }[]
    cleaned: { name: string; rooms: number }[]
  }
  maintenance: {
    opened: number
    resolved: number
    avg_hours: number | null
    open_now: number
    urgent_now: number
  }
  guests: {
    id: string
    name: string
    phone: string
    city: string
    stays: number
    nights: number
    paid: number
  }[]
}

export type OnlineOrder = {
  id: string
  bookingId: string
  guestName: string
  gatewayOrderId: string
  amountPaise: number
  status: "created" | "paid" | "failed" | "expired"
  gatewayPaymentId: string | null
  failureReason: string | null
  createdAt: string
}
export type OnlinePayments = { enabled: boolean; orders: OnlineOrder[] }

export type PortfolioRow = {
  propertyId: string
  propertyName: string
  current: boolean
  occupancyPct: number
  collectedPaise: number
  outstandingPaise: number
  inHouse: number
  arrivals: number
  departures: number
  totalUnits: number
  bookedUnits: number
}
