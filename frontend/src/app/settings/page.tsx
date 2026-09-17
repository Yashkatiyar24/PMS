"use client"

/**
 * The settings screen is generated from the backend's registry, not hand-written.
 *
 * That is the whole point of the registry: a new rule appears here, with its default, its description and
 * the role allowed to change it, without anyone editing this file. Sending null resets a key to its default.
 * Each group folds closed; a rule that has been changed from its default says so in the summary.
 */
import { useCallback, useMemo, useState } from "react"
import { Building2, DoorOpen, LogOut, Percent, ShieldCheck, Users } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import type { SettingDef } from "@/lib/types"
import { useResource } from "@/lib/use-resource"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { Avatar, Banner, Button, Chip, ChoiceChips, Disclosure, ListCard, ListRow, Loading, PageHeader, SectionLabel } from "@/components/ui"

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

  const setup = [
    { href: "/settings/property", label: t("setup.property"), icon: Building2, tone: "brand" as const, need: "MANAGER" as const },
    { href: "/settings/rooms", label: t("setup.roomTypes"), icon: DoorOpen, tone: "teal" as const, need: "MANAGER" as const },
    { href: "/settings/tax", label: t("setup.tax"), icon: Percent, tone: "violet" as const, need: "MANAGER" as const },
    { href: "/settings/staff", label: t("setup.staff"), icon: Users, tone: "ok" as const, need: "MANAGER" as const },
  ].filter((item) => can(item.need))

  return (
    <div className="space-y-4">
      <PageHeader title={t("settings.title")} subtitle={user ? `${user.name} · ${user.role?.toLowerCase() ?? ""}` : undefined} />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}

      {(setup.length > 0 || user?.superAdmin) && (
        <ListCard>
          {setup.map(({ href, label, icon: Icon, tone }) => (
            <ListRow key={href} href={href} leading={<Avatar tone={tone} icon={Icon} size={38} />} title={label} />
          ))}
          {user?.superAdmin && <ListRow href="/admin" leading={<Avatar tone="warn" icon={ShieldCheck} size={38} />} title={t("admin.title")} />}
        </ListCard>
      )}

      <SectionLabel>{t("settings.rules")}</SectionLabel>

      <div className="space-y-2">
        {grouped.map(([group, defs]) => {
          const changed = defs.filter((d) => JSON.stringify(values[d.key]) !== JSON.stringify(d.defaultValue)).length
          return (
            <Disclosure key={group} title={registry.groups[group] ?? group} summary={`${defs.length} · ${changed > 0 ? `${changed} ≠ ${t("settings.default").toLowerCase()}` : t("settings.default")}`}>
              <div className="divide-y divide-line">
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
              </div>
            </Disclosure>
          )
        })}
      </div>

      <Button variant="ghost" className="w-full text-danger hover:bg-danger-soft" onClick={logout}>
        <LogOut size={18} aria-hidden /> {t("action.logout")}
      </Button>
    </div>
  )
}

function SettingRow({ def, value, editable, saved, onChange, onReset }: { def: SettingDef; value: unknown; editable: boolean; saved: boolean; onChange: (value: unknown) => void; onReset: () => void }) {
  const { t } = useI18n()
  const isDefault = JSON.stringify(value) === JSON.stringify(def.defaultValue)

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-medium">{humanise(def.key)}</span>
        {saved ? <Chip tone="ok">{t("settings.savedAt")}</Chip> : !isDefault && <Chip tone="brand">≠ {t("settings.default")}</Chip>}
      </div>
      <p className="mb-2 text-xs text-ink-soft">{def.description}</p>
      <Control def={def} value={value} editable={editable} onChange={onChange} />
      {!isDefault && editable && (
        <button onClick={onReset} className="mt-1.5 text-xs font-semibold text-brand-ink">
          {t("settings.resetToDefault")} ({String(summarise(def.defaultValue))})
        </button>
      )}
    </div>
  )
}

function Control({ def, value, editable, onChange }: { def: SettingDef; value: unknown; editable: boolean; onChange: (value: unknown) => void }) {
  const { t } = useI18n()
  switch (def.type) {
    case "BOOL":
      return (
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(value)}
          disabled={!editable}
          onClick={() => onChange(!value)}
          className="flex items-center gap-3 disabled:opacity-45"
        >
          <span className={`relative inline-block h-7 w-12 rounded-full transition-colors ${value ? "bg-brand" : "bg-line-strong"}`}>
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${value ? "translate-x-[22px]" : "translate-x-0.5"}`} />
          </span>
          <span className="text-sm font-medium">{value ? t("common.yes") : t("common.no")}</span>
        </button>
      )
    case "INT":
      return <input type="number" disabled={!editable} min={def.min ?? undefined} max={def.max ?? undefined} value={Number(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))} className="max-w-[160px]" />
    case "TIME":
      return <input type="time" disabled={!editable} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className="max-w-[160px]" />
    case "ENUM":
      return <ChoiceChips disabled={!editable} value={String(value ?? "")} onChange={onChange} options={(def.options ?? []).map((o) => ({ value: o, label: o }))} />
    case "LIST": {
      const selected = Array.isArray(value) ? (value as string[]) : []
      if (!def.options) return <input disabled value={selected.join(", ")} />
      return (
        <ChoiceChips
          disabled={!editable}
          value={selected}
          onChange={(option) => onChange(selected.includes(option) ? selected.filter((s) => s !== option) : [...selected, option])}
          options={def.options.map((o) => ({ value: o, label: o }))}
        />
      )
    }
    case "I18N_TEXT": {
      const texts = (value ?? {}) as Record<string, string>
      return (
        <div className="space-y-2">
          {["hi", "en"].map((lang) => (
            <div key={lang}>
              <span className="text-xs font-semibold uppercase text-ink-faint">{lang}</span>
              <textarea rows={2} disabled={!editable} value={texts[lang] ?? ""} onChange={(e) => onChange({ ...texts, [lang]: e.target.value })} />
            </div>
          ))}
        </div>
      )
    }
    default:
      return <input disabled={!editable} maxLength={def.maxLength ?? undefined} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
  }
}

const humanise = (key: string) => key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
const summarise = (value: unknown) => (Array.isArray(value) ? value.join(", ") : typeof value === "object" ? "…" : value)
