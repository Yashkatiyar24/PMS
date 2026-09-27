import type { SettingDef, SettingValues } from "../types"

/** Edits accumulate here until Save: a value, or `null` to reset the key to its default. */
export type Draft = Record<string, unknown | null>

export function isEqualValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** What the screen shows for a key: the draft, else the saved value, else the default. */
export function effectiveValue(def: SettingDef, values: SettingValues, draft: Draft): unknown {
  if (def.key in draft) return draft[def.key] === null ? def.defaultValue : draft[def.key]
  return values[def.key] ?? def.defaultValue
}

/** Set a value in the draft; an edit back to the saved value drops the draft entry. */
export function setDraft(
  draft: Draft,
  def: SettingDef,
  values: SettingValues,
  value: unknown,
): Draft {
  const saved = values[def.key] ?? def.defaultValue
  const next = { ...draft }
  if (isEqualValue(saved, value)) delete next[def.key]
  else next[def.key] = value
  return next
}

/** Mark a key to be reset to its default. */
export function resetDraft(draft: Draft, def: SettingDef, values: SettingValues): Draft {
  const next = { ...draft }
  if (isEqualValue(values[def.key] ?? def.defaultValue, def.defaultValue)) delete next[def.key]
  else next[def.key] = null
  return next
}

/** Keys whose saved value differs from the default. */
export function changedFromDefault(defs: SettingDef[], values: SettingValues): number {
  return defs.filter((d) => d.key in values && !isEqualValue(values[d.key], d.defaultValue)).length
}

/** The unit suffix the web shows after an INT from its key. */
export function unitFor(key: string): string | null {
  if (key.endsWith("_paise")) return "₹"
  if (key.endsWith("_minutes")) return "settings.unit.minutes"
  if (key.endsWith("_hours")) return "settings.unit.hours"
  if (key.endsWith("_days") || key.endsWith("_days_ahead")) return "settings.unit.days"
  if (key.endsWith("_nights")) return "settings.unit.nights"
  if (key.endsWith("_kb")) return "settings.unit.kb"
  if (key.endsWith("_pct")) return "settings.unit.pct"
  return null
}

/** An INT typed by the desk, validated against the definition; null when invalid. Money keys are typed in rupees. */
export function parseInt_(def: SettingDef, text: string): number | null {
  if (text.trim() === "") return null
  const isMoney = def.key.endsWith("_paise")
  const n = isMoney ? Math.round(parseFloat(text) * 100) : parseInt(text, 10)
  if (!Number.isFinite(n)) return null
  if (def.min !== null && n < def.min) return null
  if (def.max !== null && n > def.max) return null
  return n
}

export function intToText(def: SettingDef, value: unknown): string {
  if (typeof value !== "number") return ""
  return def.key.endsWith("_paise") ? String(value / 100) : String(value)
}

/** Who may change a setting: MANAGER < OWNER < SUPER_ADMIN. */
export function canEdit(
  def: SettingDef,
  rank: "MANAGER" | "OWNER" | null,
  superAdmin: boolean,
): boolean {
  if (def.who === "SUPER_ADMIN") return superAdmin
  if (def.who === "OWNER") return rank === "OWNER" || superAdmin
  return rank !== null || superAdmin
}

/** Search across label, description and key. */
export function matchesQuery(def: SettingDef, label: string, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return `${label} ${def.description} ${def.key}`.toLowerCase().includes(needle)
}
