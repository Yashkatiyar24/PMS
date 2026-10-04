/** The settings registry the backend describes; the Settings screen is built from it. */
export type SettingType = "BOOL" | "INT" | "TIME" | "ENUM" | "TEXT" | "LIST" | "I18N_TEXT"
export type SettingWho = "MANAGER" | "OWNER" | "SUPER_ADMIN"

export type SettingDef = {
  key: string
  group: string
  type: SettingType
  defaultValue: unknown
  who: SettingWho
  options: string[] | null
  min: number | null
  max: number | null
  maxLength: number | null
  description: string
}

export type Registry = { definitions: SettingDef[]; groups: Record<string, string> }

/** Resolved values keyed by setting key. */
export type SettingValues = Record<string, unknown>

export type Property = {
  id: string
  name: string
  address: string
  city: string
  state: string
  phone: string
  email: string | null
  gstin: string | null
  trustRegNo: string | null
  reg12a: string | null
  reg80g: string | null
  timezone: string
  code?: string
  photoUrl: string | null
}
export type PropertyInput = Omit<Property, "id" | "code" | "photoUrl">

export type TaxSlab = { uptoPaise: number | null; bp: number }
export type TaxRules = { slabs: TaxSlab[]; note: string | null }
export type TaxRule = { id: string; effectiveFrom: string; rules: TaxRules }

export type StaffMember = {
  userId: string
  name: string
  phone: string | null
  email: string | null
  role: string
  active: boolean
  hasPin: boolean
}
export type InviteInput = { name: string; phone: string; email: string; role: string }
export type Invited = StaffMember & { password?: string }

export type ChannelLink = {
  id: string
  roomId: string
  roomNumber: string
  channel: string
  exportToken: string
  importUrl: string | null
  lastSyncedAt: string | null
  lastError: string | null
  conflicts: number
}
export type ChannelConflict = {
  id: string
  channel: string
  roomNumber: string
  arriveOn: string
  departOn: string
  summary: string
  conflict: string
}
export type ChannelsOverview = {
  bookingSlug: string | null
  onlineBookingEnabled: boolean
  links: ChannelLink[]
  conflicts: ChannelConflict[]
  rooms: { id: string; number: string; typeName: string }[]
}
export const OTA_CHANNELS = [
  "airbnb",
  "booking_com",
  "makemytrip",
  "agoda",
  "expedia",
  "other",
] as const

/** Read from settings by several screens; typed access to the few keys the desk needs. */
export function settingString(values: SettingValues | null, key: string, fallback: string): string {
  const v = values?.[key]
  return typeof v === "string" ? v : fallback
}
export function settingNumber(values: SettingValues | null, key: string, fallback: number): number {
  const v = values?.[key]
  return typeof v === "number" ? v : fallback
}
export function settingBool(values: SettingValues | null, key: string, fallback: boolean): boolean {
  const v = values?.[key]
  return typeof v === "boolean" ? v : fallback
}
export function settingList(
  values: SettingValues | null,
  key: string,
  fallback: string[],
): string[] {
  const v = values?.[key]
  return Array.isArray(v) ? v.map(String) : fallback
}
