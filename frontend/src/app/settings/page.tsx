"use client"

/**
 * The settings screen is generated from the backend's registry, not hand-written.
 *
 * That is the whole point of the registry: a new rule appears here, with its default, its description and
 * the role allowed to change it, without anyone editing this file. Sending null resets a key to its default.
 */
import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import { Building2, ChevronRight, DoorOpen, Percent, ShieldCheck, Users } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import type { SettingDef } from "@/lib/types"
import { useResource } from "@/lib/use-resource"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { Banner, Button, Card, Chip, Loading } from "@/components/ui"

type Registry = { definitions: SettingDef[]; groups: Record<string, string> }
type Values = Record<string, unknown>

export default function SettingsPage() {
  const { t } = useI18n()
  const { user, can, logout } = useSession()
  const { data: loaded } = useResource(
    async () => {
      const [registry, values] = await Promise.all([api<Registry>("/api/settings/registry"), api<Values>("/api/settings")])
      return { registry, values }
    },
    [],
    t("error.generic"),
  )
  const registry = loaded?.registry ?? null
  const [edited, setEdited] = useState<Values | null>(null)
  const values = useMemo(() => edited ?? loaded?.values ?? {}, [edited, loaded])
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")
  const setValues = useCallback((next: Values | ((current: Values) => Values)) => {
    setEdited((current) => (typeof next === "function" ? (next as (c: Values) => Values)(current ?? {}) : next))
  }, [])

  const save = useCallback(
    async (key: string, value: unknown) => {
      setError("")
      const previous = values[key]
      setValues((v) => ({ ...v, [key]: value }))
      try {
        setValues(await api<Values>("/api/settings", { method: "PATCH", body: { [key]: value } }))
        setSaved(key)
        setTimeout(() => setSaved(""), 1500)
      } catch (e) {
        setValues((v) => ({ ...v, [key]: previous }))
        setError(e instanceof ApiError ? e.message : t("error.generic"))
      }
    },
    [values, setValues, t],
  )

  const grouped = useMemo(() => {
    if (!registry) return []
    const byGroup = new Map<string, SettingDef[]>()
    for (const def of registry.definitions) {
      if (def.who === "SUPER_ADMIN" && !user?.superAdmin) continue
      byGroup.set(def.group, [...(byGroup.get(def.group) ?? []), def])
    }
    return [...byGroup.entries()]
  }, [registry, user])

  if (!registry) return <Loading />

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("settings.title")}</h1>
      {error && <Banner tone="danger">{error}</Banner>}

      <nav>
        <ul className="space-y-2">
          {[
            { href: "/settings/property", label: t("setup.property"), icon: Building2, need: "MANAGER" as const },
            { href: "/settings/rooms", label: t("setup.roomTypes"), icon: DoorOpen, need: "MANAGER" as const },
            { href: "/settings/tax", label: t("setup.tax"), icon: Percent, need: "MANAGER" as const },
            { href: "/settings/staff", label: t("setup.staff"), icon: Users, need: "MANAGER" as const },
          ]
            .filter((item) => can(item.need))
            .map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link href={href}>
                  <Card className="flex items-center justify-between gap-2 py-3">
                    <span className="flex items-center gap-2 font-medium">
                      <Icon size={18} aria-hidden /> {label}
                    </span>
                    <ChevronRight size={18} aria-hidden className="text-[var(--color-ink-soft)]" />
                  </Card>
                </Link>
              </li>
            ))}
          {user?.superAdmin && (
            <li>
              <Link href="/admin">
                <Card className="flex items-center justify-between gap-2 py-3">
                  <span className="flex items-center gap-2 font-medium">
                    <ShieldCheck size={18} aria-hidden /> {t("admin.title")}
                  </span>
                  <ChevronRight size={18} aria-hidden className="text-[var(--color-ink-soft)]" />
                </Card>
              </Link>
            </li>
          )}
        </ul>
      </nav>

      <h2 className="pt-2 text-lg font-bold">{t("settings.rules")}</h2>

      {grouped.map(([group, defs]) => (
        <Card key={group} className="space-y-4">
          <h2 className="font-semibold">{registry.groups[group] ?? group}</h2>
          {defs.map((def) => (
            <SettingRow
              key={def.key}
              def={def}
              value={values[def.key]}
              editable={def.who === "MANAGER" ? can("MANAGER") : def.who === "OWNER" ? can("OWNER") : !!user?.superAdmin}
              saved={saved === def.key}
              onChange={(v) => save(def.key, v)}
              onReset={() => save(def.key, null)}
            />
          ))}
        </Card>
      ))}

      <Button variant="secondary" className="w-full" onClick={logout}>
        {t("action.logout")}
      </Button>
    </div>
  )
}

function SettingRow({
  def,
  value,
  editable,
  saved,
  onChange,
  onReset,
}: {
  def: SettingDef
  value: unknown
  editable: boolean
  saved: boolean
  onChange: (value: unknown) => void
  onReset: () => void
}) {
  const { t } = useI18n()
  const isDefault = JSON.stringify(value) === JSON.stringify(def.defaultValue)

  return (
    <div className="border-t border-[var(--color-line)] pt-3 first:border-0 first:pt-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-medium">{humanise(def.key)}</span>
        {saved && <Chip tone="ok">{t("settings.savedAt")}</Chip>}
      </div>
      <p className="mb-2 text-xs text-[var(--color-ink-soft)]">{def.description}</p>

      <Control def={def} value={value} editable={editable} onChange={onChange} />

      {!isDefault && editable && (
        <button onClick={onReset} className="mt-1 text-xs text-[var(--color-brand)] underline">
          {t("settings.resetToDefault")} ({String(summarise(def.defaultValue))})
        </button>
      )}
    </div>
  )
}

function Control({
  def,
  value,
  editable,
  onChange,
}: {
  def: SettingDef
  value: unknown
  editable: boolean
  onChange: (value: unknown) => void
}) {
  switch (def.type) {
    case "BOOL":
      return (
        <label className="flex gap-3">
          <input type="checkbox" disabled={!editable} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          <span className="text-sm">{Boolean(value) ? "on" : "off"}</span>
        </label>
      )
    case "INT":
      return (
        <input
          type="number"
          disabled={!editable}
          min={def.min ?? undefined}
          max={def.max ?? undefined}
          value={Number(value ?? 0)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )
    case "TIME":
      return <input type="time" disabled={!editable} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
    case "ENUM":
      return (
        <select disabled={!editable} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          {(def.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )
    case "LIST": {
      const selected = Array.isArray(value) ? (value as string[]) : []
      if (!def.options) return <input disabled value={selected.join(", ")} />
      return (
        <ul className="flex flex-wrap gap-2">
          {def.options.map((option) => {
            const on = selected.includes(option)
            return (
              <li key={option}>
                <button
                  disabled={!editable}
                  onClick={() => onChange(on ? selected.filter((s) => s !== option) : [...selected, option])}
                  className={`rounded-full border px-3 py-1 text-sm ${on ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] font-semibold text-[var(--color-brand)]" : "border-[var(--color-line)]"}`}
                >
                  {option}
                </button>
              </li>
            )
          })}
        </ul>
      )
    }
    case "I18N_TEXT": {
      const texts = (value ?? {}) as Record<string, string>
      return (
        <div className="space-y-2">
          {["hi", "en"].map((lang) => (
            <div key={lang}>
              <span className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">{lang}</span>
              <textarea
                rows={2}
                disabled={!editable}
                value={texts[lang] ?? ""}
                onChange={(e) => onChange({ ...texts, [lang]: e.target.value })}
              />
            </div>
          ))}
        </div>
      )
    }
    default:
      return (
        <input
          disabled={!editable}
          maxLength={def.maxLength ?? undefined}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}

const humanise = (key: string) => key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
const summarise = (value: unknown) => (Array.isArray(value) ? value.join(", ") : typeof value === "object" ? "…" : value)
