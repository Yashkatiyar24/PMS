import type { BillingStatus } from "@/features/auth/types"

export type PropertyHealth = {
  propertyId: string
  propertyName: string
  city: string
  state: string
  phone: string
  orgId: string
  orgName: string
  plan: string | null
  billingStatus: BillingStatus
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
  photoUrl: string | null
  notes: string | null
}
export type Plan = { code: string; name: string; maxRooms: number; monthlyPaise: number }
export type TeamMember = {
  userId: string
  name: string
  phone: string | null
  role: string
  active: boolean
}
export type NewPropertyInput = {
  orgName: string
  propertyName: string
  city: string
  state: string
  phone: string
  ownerName: string
  ownerPhone: string
  ownerEmail: string
  planCode: string
}
export type NewPropertyResult = {
  orgId: string
  propertyId: string
  ownerId: string
  ownerPhone: string
  ownerEmail: string
  code: string
  ownerPassword?: string
}
export type ActivityRow = { at: string; table_name: string; action: string; who: string | null }

export const BILLING_STATUSES: BillingStatus[] = [
  "trial",
  "active",
  "overdue",
  "readonly",
  "closed",
]
export const MODULES = [
  "restaurant",
  "inventory",
  "expenses",
  "maintenance",
  "lost_found",
  "audit",
] as const
export const QUIET_DAYS = 14

export function isQuiet(p: PropertyHealth, now = Date.now()): boolean {
  const cutoff = now - QUIET_DAYS * 86400000
  return (
    p.active &&
    new Date(p.createdAt).getTime() < cutoff &&
    (p.lastActivityAt ? new Date(p.lastActivityAt).getTime() : 0) < cutoff
  )
}

export function needsAttention(p: PropertyHealth): boolean {
  return (
    !p.active ||
    p.billingStatus === "overdue" ||
    p.billingStatus === "readonly" ||
    p.billingStatus === "closed" ||
    p.outboxPending > 0
  )
}
