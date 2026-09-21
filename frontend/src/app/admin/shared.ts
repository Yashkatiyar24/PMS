/** What the platform sees of a property, shared by the list and the property's own page. Counts, never guest data. */
import type { Tone } from "@/components/ui"

export type PropertyHealth = {
  propertyId: string
  propertyName: string
  city: string
  state: string
  phone: string
  orgId: string
  orgName: string
  plan: string
  billingStatus: string
  active: boolean
  rooms: number
  users: number
  stayingNow: number
  bookingsLast30Days: number
  lastActivityAt: string | null
  openFolios: number
  outstandingPaise: number
  outboxPending: number
  supportAccess: boolean
  code: string
  modules: string[]
  createdAt: string
  ownerName: string | null
  ownerPhone: string | null
  /** A short-lived link to the property's photograph, or null when it has none. */
  photoUrl: string | null
  /** The platform team's own notes; the property never sees them. */
  notes: string | null
}

export type Plan = { code: string; name: string; maxRooms: number; monthlyPaise: number }
export type Member = { userId: string; name: string; phone: string | null; role: string; active: boolean }

/** A property with no new booking for this long has probably stopped using the app: worth a call. */
export const QUIET_DAYS = 14
export const isQuiet = (p: PropertyHealth, now = Date.now()) => {
  const cutoff = now - QUIET_DAYS * 86_400_000
  const last = p.lastActivityAt ? Date.parse(p.lastActivityAt) : 0
  return p.active && Date.parse(p.createdAt) < cutoff && last < cutoff
}

export const BILLING_TONE: Record<string, Tone> = { active: "ok", trial: "brand", overdue: "warn", readonly: "danger", closed: "neutral" }
export const STATUSES = ["trial", "active", "overdue", "readonly", "closed"] as const

/** A property a human should look at: behind on billing, switched off, or with messages stuck in its outbox. */
export const needsAttention = (p: PropertyHealth) => !p.active || ["overdue", "readonly", "closed"].includes(p.billingStatus) || p.outboxPending > 0

// The optional parts, labelled with their own screens' titles. A new property starts with none of them.
export const MODULES = [
  { value: "restaurant", label: "pos.title" },
  { value: "inventory", label: "stock.title" },
  { value: "expenses", label: "expense.title" },
  { value: "maintenance", label: "maint.title" },
  { value: "lost_found", label: "lost.title" },
  { value: "audit", label: "audit.title" },
] as const
