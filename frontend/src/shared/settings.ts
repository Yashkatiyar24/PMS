/**
 * Settings registry (PRD section 14).
 *
 * Every rule that differs between properties is a key here with a default.
 * The settings screen is generated from this list; the Zod schema validates
 * what is stored in properties.settings; resolveSettings() merges defaults.
 * A behaviour that is not in this table is the same for every property.
 */
import { z } from "zod"

export type SettingRole = "manager" | "owner" | "super_admin"

export type SettingDef =
  | { key: string; group: string; who: SettingRole; description: string; type: "bool"; default: boolean }
  | { key: string; group: string; who: SettingRole; description: string; type: "int"; default: number; min?: number; max?: number }
  | { key: string; group: string; who: SettingRole; description: string; type: "time"; default: string }
  | { key: string; group: string; who: SettingRole; description: string; type: "enum"; default: string; options: readonly string[] }
  | { key: string; group: string; who: SettingRole; description: string; type: "text"; default: string; maxLength?: number; multiline?: boolean }
  | { key: string; group: string; who: SettingRole; description: string; type: "list"; default: string[]; options?: readonly string[] }
  | { key: string; group: string; who: SettingRole; description: string; type: "i18ntext"; default: Record<string, string> }

export const LANGUAGES = ["en", "hi"] as const
export const PAYMENT_MODES = ["cash", "upi", "card", "bank", "cheque"] as const
export const PRINTER_PROFILES = ["thermal_58", "thermal_80", "a4"] as const
export const REGISTER_COLUMNS = [
  "serial", "name", "address", "nationality", "id", "arrival", "departure", "unit",
  "adults", "children", "members", "purpose", "phone",
] as const

export const SETTINGS: readonly SettingDef[] = [
  // Language
  { key: "languages", group: "language", who: "owner", type: "list", default: ["hi", "en"], options: LANGUAGES, description: "Languages offered in the UI; the first is the default." },
  { key: "guest_language", group: "language", who: "manager", type: "enum", default: "hi", options: LANGUAGES, description: "Language for guest-facing messages and receipts." },

  // Stay and billing
  { key: "checkin_time", group: "stay", who: "manager", type: "time", default: "12:00", description: "Standard check-in time shown on confirmations." },
  { key: "checkout_time", group: "stay", who: "manager", type: "time", default: "10:00", description: "Standard checkout time; used by night billing." },
  { key: "billing_mode", group: "stay", who: "owner", type: "enum", default: "night", options: ["night", "24h"], description: "Charge per night (fixed checkout time) or per 24 hours from arrival." },
  { key: "late_grace_minutes", group: "stay", who: "manager", type: "int", default: 60, min: 0, max: 720, description: "Minutes past checkout time before a late charge applies." },
  { key: "late_checkout_policy", group: "stay", who: "manager", type: "enum", default: "half_day", options: ["none", "half_day", "full_day"], description: "What a late checkout beyond the grace period costs." },
  { key: "day_use_allowed", group: "stay", who: "manager", type: "bool", default: true, description: "Allow same-day arrival and departure stays." },
  { key: "day_use_rate_pct", group: "stay", who: "manager", type: "int", default: 50, min: 0, max: 100, description: "Day-use charge as a percentage of the room rate." },
  { key: "dorm_whole_room_allowed", group: "stay", who: "owner", type: "bool", default: false, description: "Allow booking an entire dormitory room instead of individual beds." },
  { key: "tape_chart_days", group: "stay", who: "manager", type: "int", default: 14, min: 7, max: 60, description: "Days shown on the tape chart." },
  { key: "dirty_rooms_assignable", group: "stay", who: "manager", type: "bool", default: true, description: "Allow assigning a dirty room (with a warning)." },

  // Reservations
  { key: "noshow_hour", group: "reservations", who: "manager", type: "time", default: "18:00", description: "Reserved bookings not arrived by this time are flagged." },
  { key: "noshow_policy", group: "reservations", who: "owner", type: "enum", default: "forfeit", options: ["forfeit", "refund", "partial"], description: "What happens to the advance on a no-show." },
  { key: "noshow_partial_pct", group: "reservations", who: "owner", type: "int", default: 50, min: 0, max: 100, description: "Percentage of the advance kept when the policy is partial." },

  // Day and cash
  { key: "business_day_start", group: "day", who: "owner", type: "time", default: "21:00", description: "A business day runs from this hour to the same hour next day; the report is sent then." },
  { key: "report_channel", group: "day", who: "owner", type: "enum", default: "both", options: ["whatsapp", "email", "both"], description: "Where the daily report is sent." },

  // People and approvals
  { key: "approval_mode", group: "people", who: "owner", type: "enum", default: "pin", options: ["pin", "queue"], description: "How manager approval is given: PIN on the staff device, or a request queue." },
  { key: "staff_edit_window", group: "people", who: "owner", type: "enum", default: "business_day", options: ["business_day", "hours_24", "none"], description: "How far back staff may edit records." },
  { key: "session_days", group: "people", who: "owner", type: "int", default: 30, min: 1, max: 365, description: "Days a login stays valid on a trusted device." },

  // Guests and compliance
  { key: "id_photo_required", group: "guests", who: "manager", type: "bool", default: true, description: "Require an ID photo at check-in (skippable with a logged reason)." },
  { key: "id_photo_max_kb", group: "guests", who: "owner", type: "int", default: 300, min: 50, max: 2000, description: "Client-side compression target for ID photos." },
  { key: "id_photo_retention_days", group: "guests", who: "owner", type: "int", default: 730, min: 30, max: 3650, description: "Days after checkout before ID photos are purged." },
  { key: "register_requires_all_names", group: "guests", who: "manager", type: "bool", default: true, description: "Require names of all adult members for the police register." },
  { key: "register_template", group: "guests", who: "manager", type: "list", default: ["serial", "name", "address", "nationality", "id", "arrival", "departure", "unit", "adults", "children", "members", "purpose"], options: REGISTER_COLUMNS, description: "Columns and order of the police register export." },
  { key: "consent_required", group: "guests", who: "owner", type: "bool", default: true, description: "Show the consent notice at check-in." },
  { key: "consent_text", group: "guests", who: "owner", type: "i18ntext", default: {
      en: "Your details are collected for the guest register as required by law and to send your receipt. They are not shared for marketing.",
      hi: "आपकी जानकारी कानून के अनुसार अतिथि रजिस्टर और रसीद भेजने के लिए ली जा रही है। इसे विपणन के लिए साझा नहीं किया जाएगा।",
    }, description: "Consent notice shown at check-in." },

  // Tax
  { key: "tax_exempt", group: "tax", who: "owner", type: "bool", default: false, description: "Charge no GST regardless of slabs (confirm with your CA)." },
  { key: "religious_precinct", group: "tax", who: "owner", type: "bool", default: false, description: "Rooms inside a religious precinct run by a registered trust; enables the exemption threshold." },
  { key: "exemption_threshold_paise", group: "tax", who: "owner", type: "int", default: 100000, min: 0, max: 100000000, description: "Per-day rate below which rooms are exempt when religious_precinct is on (confirm value with CA)." },
  { key: "donation_mode", group: "tax", who: "owner", type: "bool", default: false, description: "Issue donation receipts (80G) instead of invoices. Requires CA confirmation below." },
  { key: "donation_mode_ca_confirmed", group: "tax", who: "owner", type: "bool", default: false, description: "The trust's CA has confirmed donation receipts are appropriate." },

  // Receipts and printing
  { key: "receipt_prefix", group: "receipts", who: "owner", type: "text", default: "", maxLength: 5, description: "Prefix for receipt numbers (max 5 characters)." },
  { key: "receipt_number_format", group: "receipts", who: "owner", type: "text", default: "{PREFIX}/{FY}/{SEQ:4}", maxLength: 24, description: "Number pattern; total length must stay within 16 characters." },
  { key: "receipt_header", group: "receipts", who: "manager", type: "text", default: "", maxLength: 300, multiline: true, description: "Text printed at the top of receipts." },
  { key: "receipt_footer", group: "receipts", who: "manager", type: "text", default: "", maxLength: 300, multiline: true, description: "Text printed at the bottom of receipts." },
  { key: "receipt_terms", group: "receipts", who: "manager", type: "text", default: "", maxLength: 500, multiline: true, description: "Terms printed on invoices." },
  { key: "receipt_logo_key", group: "receipts", who: "manager", type: "text", default: "", maxLength: 200, description: "Storage key of the logo image." },
  { key: "offline_receipt_mode", group: "receipts", who: "owner", type: "enum", default: "provisional", options: ["provisional", "device_block"], description: "How receipts are numbered when a device is offline." },
  { key: "offline_block_size", group: "receipts", who: "owner", type: "int", default: 20, min: 5, max: 200, description: "Numbers each device reserves in device_block mode." },
  { key: "offline_cache_days", group: "receipts", who: "owner", type: "int", default: 7, min: 1, max: 30, description: "Days of bookings cached on the device for offline use." },
  { key: "printer_profile", group: "receipts", who: "manager", type: "enum", default: "thermal_58", options: PRINTER_PROFILES, description: "Paper size template used for printing." },

  // Money
  { key: "upi_vpa", group: "money", who: "owner", type: "text", default: "", maxLength: 100, description: "UPI ID shown as a QR on screen and receipts." },
  { key: "upi_payee_name", group: "money", who: "owner", type: "text", default: "", maxLength: 100, description: "Payee name for the UPI QR." },
  { key: "payment_modes", group: "money", who: "manager", type: "list", default: [...PAYMENT_MODES], options: PAYMENT_MODES, description: "Payment modes offered at the desk." },
  { key: "deposit_default_paise", group: "money", who: "manager", type: "int", default: 0, min: 0, max: 10000000, description: "Default refundable deposit suggested at check-in." },

  // Messaging
  { key: "whatsapp_enabled", group: "messaging", who: "owner", type: "bool", default: true, description: "Send WhatsApp messages from this property." },
  { key: "push_enabled", group: "messaging", who: "owner", type: "bool", default: true, description: "Send push notifications to staff devices." },

  // Platform (super-admin)
  { key: "support_access_until", group: "platform", who: "owner", type: "text", default: "", maxLength: 40, description: "ISO timestamp until which our support may view guest data." },
  { key: "org_data_retention_days", group: "platform", who: "super_admin", type: "int", default: 90, min: 30, max: 3650, description: "Days after a property leaves before its data is deleted." },
  { key: "grace_banner_days", group: "platform", who: "super_admin", type: "int", default: 15, min: 0, max: 365, description: "Days unpaid before a billing banner shows." },
  { key: "grace_readonly_days", group: "platform", who: "super_admin", type: "int", default: 45, min: 0, max: 365, description: "Days unpaid before the property becomes read-only." },
] as const

export const SETTING_GROUPS: Record<string, string> = {
  language: "Language", stay: "Stay and billing", reservations: "Reservations", day: "Business day and reports",
  people: "People and approvals", guests: "Guests and compliance", tax: "Tax", receipts: "Receipts and printing",
  money: "Money", messaging: "Messaging", platform: "Platform",
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function schemaFor(def: SettingDef): z.ZodTypeAny {
  switch (def.type) {
    case "bool": return z.boolean()
    case "int": { let s = z.number().int(); if (def.min !== undefined) s = s.min(def.min); if (def.max !== undefined) s = s.max(def.max); return s }
    case "time": return z.string().regex(TIME_RE, "HH:MM")
    case "enum": return z.enum(def.options as [string, ...string[]])
    case "text": return def.maxLength ? z.string().max(def.maxLength) : z.string()
    case "list": return def.options ? z.array(z.enum(def.options as [string, ...string[]])) : z.array(z.string())
    case "i18ntext": return z.record(z.string(), z.string())
  }
}

/** Partial schema: what is stored. Missing keys fall back to defaults. */
export const storedSettingsSchema = z.object(
  Object.fromEntries(SETTINGS.map((d) => [d.key, schemaFor(d).optional()])),
).strict()

export const SETTING_DEFAULTS: Record<string, unknown> = Object.fromEntries(SETTINGS.map((d) => [d.key, d.default]))

export interface Settings {
  languages: string[]; guest_language: string
  checkin_time: string; checkout_time: string; billing_mode: "night" | "24h"
  late_grace_minutes: number; late_checkout_policy: "none" | "half_day" | "full_day"
  day_use_allowed: boolean; day_use_rate_pct: number; dorm_whole_room_allowed: boolean
  tape_chart_days: number; dirty_rooms_assignable: boolean
  noshow_hour: string; noshow_policy: "forfeit" | "refund" | "partial"; noshow_partial_pct: number
  business_day_start: string; report_channel: "whatsapp" | "email" | "both"
  approval_mode: "pin" | "queue"; staff_edit_window: "business_day" | "hours_24" | "none"; session_days: number
  id_photo_required: boolean; id_photo_max_kb: number; id_photo_retention_days: number
  register_requires_all_names: boolean; register_template: string[]
  consent_required: boolean; consent_text: Record<string, string>
  tax_exempt: boolean; religious_precinct: boolean; exemption_threshold_paise: number
  donation_mode: boolean; donation_mode_ca_confirmed: boolean
  receipt_prefix: string; receipt_number_format: string; receipt_header: string; receipt_footer: string
  receipt_terms: string; receipt_logo_key: string
  offline_receipt_mode: "provisional" | "device_block"; offline_block_size: number; offline_cache_days: number
  printer_profile: "thermal_58" | "thermal_80" | "a4"
  upi_vpa: string; upi_payee_name: string; payment_modes: string[]; deposit_default_paise: number
  whatsapp_enabled: boolean; push_enabled: boolean
  support_access_until: string; org_data_retention_days: number; grace_banner_days: number; grace_readonly_days: number
}

/** Merge stored JSON with defaults; unknown keys are dropped, invalid values fall back to defaults. */
export function resolveSettings(raw: unknown): Settings {
  const out: Record<string, unknown> = { ...SETTING_DEFAULTS }
  if (raw && typeof raw === "object") {
    for (const def of SETTINGS) {
      const v = (raw as Record<string, unknown>)[def.key]
      if (v === undefined || v === null) continue
      const parsed = schemaFor(def).safeParse(v)
      if (parsed.success) out[def.key] = parsed.data
    }
  }
  return out as unknown as Settings
}

/** Validate a partial update; throws ZodError on bad input. */
export function validateSettingsPatch(patch: unknown): Record<string, unknown> {
  return storedSettingsSchema.parse(patch) as Record<string, unknown>
}

export const ROLE_RANK: Record<string, number> = { staff: 0, manager: 1, owner: 2, super_admin: 3 }
export function canEditSetting(role: string, def: SettingDef): boolean {
  return (ROLE_RANK[role] ?? -1) >= ROLE_RANK[def.who]
}
