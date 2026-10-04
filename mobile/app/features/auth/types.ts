import type { Role } from "@/utils/permissions"

export type { Role }

export type BillingStatus = "trial" | "active" | "overdue" | "readonly" | "closed"

export type Membership = { propertyId: string; propertyName: string; role: Role; position: string }

/** `GET /api/auth/me`: who is signed in, where they work and what they may do. */
export type CurrentUser = {
  id: string
  name: string
  superAdmin: boolean
  sessionId?: string
  propertyId: string | null
  role: Role | null
  memberships: Membership[]
  /** The role as stored: owner, admin, manager, receptionist, staff, housekeeping, accountant, maintenance. */
  position: string | null
  permissions: string[]
  billingStatus: BillingStatus | null
  mustChangePassword: boolean
}

export type LoginRequest = {
  email: string
  code: string | null
  password: string
  deviceName: string
}
export type OtpVerifyRequest = { target: string; code: string; deviceName: string }
export type LoginResponse = { status: string; expiresAt: string }

export type SessionView = {
  id: string
  deviceName: string
  createdAt: string
  lastSeenAt: string
  current: boolean
}

export type ChangePasswordRequest = { currentPassword: string | null; password: string }
