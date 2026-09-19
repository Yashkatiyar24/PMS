"use client"

/**
 * The settings screen is generated from the backend's registry, not hand-written.
 *
 * A new rule appears here, with its default, its description and the role allowed to change it, without
 * anyone editing this file; it only borrows a proper name from the language files when one exists.
 *
 * Edits collect as a draft and go to the server in one PATCH when the owner presses Save: typing "1500" is
 * one audited change, not four, and a half-typed number is never rejected mid-keystroke. Sending null
 * resets a key to its default.
 */
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Boxes, Building2, Check, ChevronRight, DoorOpen, Globe, Lock, LogOut, PackageSearch, Percent, ReceiptIndianRupee, ScrollText, Search, ShieldCheck, UserRound, Users, UtensilsCrossed, Wrench } from "lucide-react"
import { clsx } from "clsx"
import { api, ApiError } from "@/lib/api"
import type { SettingDef } from "@/lib/types"
import { useResource } from "@/lib/use-resource"
import { rupees } from "@/lib/format"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { Banner, Chip, ChoiceChips, Empty, Loading, PageHeader, TONE } from "@/components/ui"

type Registry = { definitions: SettingDef[]; groups: Record<string, string> }
type Values = Record<string, unknown>
type T = ReturnType<typeof useI18n>["t"]

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const humanise = (key: string) => key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
/** A translation when the language files have one, else a readable fallback: new registry rows still show. */
const tr = (t: T, key: string, fallback: string) => {
  const text = t(key as Parameters<T>[0])
  return text === key ? fallback : text
}
const settingLabel = (t: T, def: SettingDef) => tr(t, `setting.${def.key}`, humanise(def.key))
const optionLabel = (t: T, option: string) => tr(t, `option.${option}`, humanise(option))

/** Money is stored in paise; the owner reads and types rupees. */
const isMoney = (def: SettingDef) => def.key.endsWith("_paise")
const UNITS = [["_minutes", "minutes"], ["_hours", "hours"], ["_days", "days"], ["_days_ahead", "days"], ["_nights", "nights"], ["_kb", "kb"], ["_pct", "pct"]] as const
const unitOf = (key: string) => UNITS.find(([suffix]) => key.endsWith(suffix))?.[1]

/** What is wrong with a draft value, checked before it can be saved. The server checks again. */
function problem(t: T, def: SettingDef, value: unknown): string | null {
  if (def.type !== "INT") return null
  const outside = typeof value !== "number" || !Number.isInteger(value) || (def.min != null && value < def.min) || (def.max != null && value > def.max)
  if (!outside) return null
  const bound = (n: number | null) => (n == null ? "…" : isMoney(def) ? rupees(n) : String(n))
  return t("settings.range", { min: bound(def.min), max: bound(def.max) })
}

function describe(t: T, def: SettingDef, value: unknown): string {
  if (def.type === "BOOL") return value ? t("common.yes") : t("common.no")
  if (isMoney(def)) return rupees(Number(value))
  if (Array.isArray(value)) return value.map((v) => optionLabel(t, String(v))).join(", ")
  if (def.type === "ENUM") return optionLabel(t, String(value))
  if (value && typeof value === "object") return "…"
  return String(value ?? "") || "—"
}

export default function SettingsPage() {
  const { t } = useI18n()
  const { user, can, has, logout } = useSession()
  const { data: loaded } = useResource(
    async () => {
      const [registry, values] = await Promise.all([api<Registry>("/api/settings/registry"), api<Values>("/api/settings")])
      return { registry, values }
    },
    [],
    t("error.generic"),
  )
  const registry = loaded?.registry ?? null
  const [savedValues, setSavedValues] = useState<Values | null>(null)
  const values = savedValues ?? loaded?.values ?? {}
  // Pending edits by key; null means "back to the default".
  const [draft, setDraft] = useState<Values>({})
  const [section, setSection] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState("")

  const dirtyKeys = Object.keys(draft)
  const dirty = dirtyKeys.length > 0

  // Closing the tab with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

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

  const defs = new Map(registry.definitions.map((d) => [d.key, d]))
  const current = (def: SettingDef) => (def.key in draft ? (draft[def.key] ?? def.defaultValue) : values[def.key])
  const editable = (def: SettingDef) => (def.who === "MANAGER" ? can("MANAGER") : def.who === "OWNER" ? can("OWNER") : !!user?.superAdmin)
  const invalid = dirtyKeys.some((key) => problem(t, defs.get(key)!, draft[key] ?? defs.get(key)!.defaultValue))
  const groupName = (group: string) => tr(t, `settings.group.${group}`, registry.groups[group] ?? group)

  function edit(def: SettingDef, next: unknown) {
    setDraft((d) => {
      const rest = { ...d }
      delete rest[def.key]
      // Back to what is already saved: nothing to send.
      return same(next ?? def.defaultValue, values[def.key]) ? rest : { ...rest, [def.key]: next }
    })
  }

  async function save() {
    setSaving(true)
    setError("")
    try {
      setSavedValues(await api<Values>("/api/settings", { method: "PATCH", body: draft }))
      setDraft({})
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
    } finally {
      setSaving(false)
    }
  }

  const setup = [
    { href: "/settings/property", label: t("setup.property"), icon: Building2, tone: "brand" as const },
    { href: "/settings/rooms", label: t("setup.roomTypes"), icon: DoorOpen, tone: "teal" as const },
    { href: "/settings/tax", label: t("setup.tax"), icon: Percent, tone: "violet" as const },
    { href: "/settings/staff", label: t("setup.staff"), icon: Users, tone: "ok" as const },
    { href: "/settings/channels", label: t("channels.title"), icon: Globe, tone: "teal" as const },
    ...(user?.superAdmin ? [{ href: "/admin", label: t("admin.title"), icon: ShieldCheck, tone: "warn" as const }] : []),
  ].filter((item) => item.href === "/admin" || can("MANAGER"))

  // The day-to-day work that has no tab of its own, each shown only to roles that do it.
  const operations = [
    { href: "/guests", label: t("guests.title"), icon: UserRound, tone: "brand" as const, show: has("reservations.view") },
    { href: "/maintenance", label: t("maint.title"), icon: Wrench, tone: "warn" as const, show: has("maintenance") || has("maintenance.report") },
    { href: "/lost-found", label: t("lost.title"), icon: PackageSearch, tone: "teal" as const, show: has("housekeeping") },
    { href: "/restaurant", label: t("pos.title"), icon: UtensilsCrossed, tone: "ok" as const, show: has("restaurant") },
    { href: "/inventory", label: t("stock.title"), icon: Boxes, tone: "teal" as const, show: has("inventory") },
    { href: "/expenses", label: t("expense.title"), icon: ReceiptIndianRupee, tone: "warn" as const, show: has("expenses") },
    { href: "/audit", label: t("audit.title"), icon: ScrollText, tone: "violet" as const, show: has("audit.view") },
  ].filter((item) => item.show)

  const q = query.trim().toLowerCase()
  const results = q
    ? grouped
        .map(([group, list]) => [group, list.filter((d) => [settingLabel(t, d), d.description, d.key].some((s) => s.toLowerCase().includes(q)))] as const)
        .filter(([, list]) => list.length > 0)
    : []
  const active = section ?? grouped[0]?.[0]
  const activeDefs = grouped.find(([group]) => group === active)?.[1] ?? []
  // On a phone the list is the whole screen until a section (or a search) is chosen.
  const showContent = !!section || !!q
  const changedIn = (list: SettingDef[]) => list.filter((d) => !same(values[d.key], d.defaultValue)).length

  const rows = (list: readonly SettingDef[]) =>
    list.map((def) => (
      <SettingRow
        key={def.key}
        def={def}
        value={current(def)}
        pending={def.key in draft}
        changed={!same(current(def), def.defaultValue)}
        editable={editable(def)}
        onChange={(v) => edit(def, v)}
        onReset={() => edit(def, null)}
      />
    ))

  return (
    <div className={clsx("space-y-5", dirty && "pb-24")}>
      <PageHeader title={t("settings.title")} subtitle={user ? `${user.name} · ${user.role?.toLowerCase() ?? ""}` : undefined} />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}

      <label className="relative block md:max-w-xs">
        <span className="sr-only">{t("settings.search")}</span>
        <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("settings.search")} className="!rounded-full !pl-10" />
      </label>

      <div className="md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:items-start md:gap-8">
        <nav aria-label={t("settings.title")} className={clsx("scroll-thin space-y-5 md:sticky md:top-8 md:max-h-[calc(100dvh-4rem)] md:overflow-y-auto", showContent && "hidden md:block")}>
          {operations.length > 0 && (
            <NavGroup title={t("settings.operationsGroup")}>
              {operations.map(({ href, label, icon: Icon, tone }) => (
                <li key={href}>
                  <Link href={href} className={navItem(false)}>
                    <Icon size={18} aria-hidden className={TONE[tone].text} />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <ChevronRight size={16} aria-hidden className="text-ink-faint" />
                  </Link>
                </li>
              ))}
            </NavGroup>
          )}

          {setup.length > 0 && (
            <NavGroup title={t("settings.setupGroup")}>
              {setup.map(({ href, label, icon: Icon, tone }) => (
                <li key={href}>
                  <Link href={href} className={navItem(false)}>
                    <Icon size={18} aria-hidden className={TONE[tone].text} />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <ChevronRight size={16} aria-hidden className="text-ink-faint" />
                  </Link>
                </li>
              ))}
            </NavGroup>
          )}

          <NavGroup title={t("settings.rules")}>
            {grouped.map(([group, list]) => {
              const on = !q && group === active
              const changed = changedIn(list)
              return (
                <li key={group}>
                  <button
                    type="button"
                    aria-current={on ? "page" : undefined}
                    onClick={() => { setSection(group); setQuery(""); window.scrollTo({ top: 0 }) }}
                    className={navItem(on)}
                  >
                    <span className="min-w-0 flex-1 truncate text-left">{groupName(group)}</span>
                    {list.some((d) => d.key in draft) && <span className="h-2 w-2 shrink-0 rounded-full bg-warn" title={t("settings.edited")} />}
                    {changed > 0 && <span className="shrink-0 rounded-full bg-brand-soft px-2 text-xs font-semibold tabular-nums text-brand-ink">{changed}</span>}
                    <ChevronRight size={16} aria-hidden className="shrink-0 text-ink-faint md:hidden" />
                  </button>
                </li>
              )
            })}
          </NavGroup>

          <button type="button" onClick={logout} className={clsx(navItem(false), "!text-danger hover:!bg-danger-soft")}>
            <LogOut size={18} aria-hidden /> {t("action.logout")}
          </button>
        </nav>

        <div className={clsx("min-w-0", !showContent && "hidden md:block")}>
          {q ? (
            results.length === 0 ? (
              <Empty icon={Search}>{t("settings.noResults", { q: query.trim() })}</Empty>
            ) : (
              <div className="space-y-8">
                {results.map(([group, list]) => (
                  <Section key={group} title={groupName(group)}>{rows(list)}</Section>
                ))}
              </div>
            )
          ) : (
            <>
              <button type="button" onClick={() => setSection(null)} className="-ml-2 mb-2 inline-flex items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-ink-soft hover:text-ink md:hidden">
                <ArrowLeft size={18} aria-hidden /> {t("settings.title")}
              </button>
              <Section title={groupName(active)} subtitle={t("settings.summary", { n: activeDefs.length, c: changedIn(activeDefs) })}>
                {rows(activeDefs)}
              </Section>
            </>
          )}
        </div>
      </div>

      {(dirty || justSaved) && (
        <div className="no-print fixed inset-x-0 bottom-[calc(66px+env(safe-area-inset-bottom))] z-30 px-4 md:bottom-6 md:left-60 md:px-8">
          <div role="status" className="anim-sheet mx-auto flex max-w-6xl items-center gap-2 rounded-2xl bg-ink py-2 pl-5 pr-2 text-bg shadow-[var(--shadow-pop)]">
            {dirty ? (
              <>
                <span className="min-w-0 flex-1 text-sm font-semibold">{t("settings.unsaved", { n: dirtyKeys.length })}</span>
                <button type="button" onClick={() => setDraft({})} disabled={saving} className="rounded-full px-4 text-sm font-semibold hover:bg-bg/10">
                  {t("settings.discard")}
                </button>
                <button type="button" onClick={save} disabled={saving || invalid} className="rounded-full bg-bg px-5 text-sm font-semibold text-ink disabled:opacity-50">
                  {t("settings.saveChanges")}
                </button>
              </>
            ) : (
              <span className="flex min-h-[44px] items-center gap-2 text-sm font-semibold">
                <Check size={16} aria-hidden /> {t("settings.savedAt")}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const navItem = (on: boolean) =>
  clsx(
    "flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:-outline-offset-2!",
    on ? "bg-brand-soft text-brand-ink" : "text-ink-soft hover:bg-surface-2 hover:text-ink",
  )

function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">{title}</h2>
      {/* A card of rows on a phone, a plain list beside the content on a laptop. */}
      <ul className="space-y-0.5 rounded-2xl border border-line bg-surface p-1.5 md:border-0 md:bg-transparent md:p-0">{children}</ul>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      <div className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]">{children}</div>
    </section>
  )
}

/** Label and explanation on the left, the control in a fixed column on the right; stacked on a phone. */
function SettingRow({
  def,
  value,
  pending,
  changed,
  editable,
  onChange,
  onReset,
}: {
  def: SettingDef
  value: unknown
  pending: boolean
  changed: boolean
  editable: boolean
  onChange: (value: unknown) => void
  onReset: () => void
}) {
  const { t } = useI18n()
  const id = `setting-${def.key}`
  const wide = def.type === "LIST" || def.type === "I18N_TEXT"
  const error = pending ? problem(t, def, value) : null

  return (
    <div className={clsx("grid gap-3 px-5 py-4 md:gap-10", !wide && "md:grid-cols-[minmax(0,1fr)_17rem]")}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={id} id={`${id}-label`} className="font-semibold">{settingLabel(t, def)}</label>
          {pending ? <Chip tone="warn" dot>{t("settings.edited")}</Chip> : changed && <Chip tone="brand">{t("settings.changed")}</Chip>}
        </div>
        <p className="mt-1 text-sm text-ink-soft">{def.description}</p>
        {!editable && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-faint">
            <Lock size={12} aria-hidden /> {t("settings.lockedTo", { role: t(`settings.role.${def.who}`) })}
          </p>
        )}
        {changed && editable && (
          <button type="button" onClick={onReset} className="inline-flex items-center text-xs font-semibold text-brand-ink hover:underline">
            {t("settings.resetToDefault")} · {describe(t, def, def.defaultValue)}
          </button>
        )}
      </div>
      <div className="min-w-0">
        <Control id={id} def={def} value={value} editable={editable} onChange={onChange} />
        {error && <p className="mt-1.5 text-xs font-medium text-danger">{error}</p>}
      </div>
    </div>
  )
}

function Control({ id, def, value, editable, onChange }: { id: string; def: SettingDef; value: unknown; editable: boolean; onChange: (value: unknown) => void }) {
  const { t } = useI18n()
  switch (def.type) {
    case "BOOL": {
      const on = Boolean(value)
      return (
        <button id={id} type="button" role="switch" aria-checked={on} disabled={!editable} onClick={() => onChange(!on)} className="inline-flex items-center gap-3 disabled:opacity-45">
          <span className={clsx("relative inline-block h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-brand" : "bg-line-strong")}>
            {/* left-0 is needed: a button centres its text, and that would put the knob mid-track. */}
            <span className={clsx("absolute left-0 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform", on ? "translate-x-[22px]" : "translate-x-0.5")} />
          </span>
          <span className="text-sm font-medium">{on ? t("common.yes") : t("common.no")}</span>
        </button>
      )
    }
    case "INT": {
      const money = isMoney(def)
      const unit = unitOf(def.key)
      const scale = (n: number | null) => (n == null ? undefined : money ? n / 100 : n)
      return (
        <div className="flex items-center gap-2">
          {money && <span className="font-semibold text-ink-soft">₹</span>}
          <input
            id={id}
            type="number"
            inputMode="numeric"
            disabled={!editable}
            min={scale(def.min)}
            max={scale(def.max)}
            value={typeof value === "number" ? (money ? value / 100 : value) : ""}
            onChange={(e) => onChange(e.target.value === "" ? "" : money ? Math.round(Number(e.target.value) * 100) : Number(e.target.value))}
            className="!w-36 tabular-nums"
          />
          {unit && <span className="text-sm text-ink-soft">{t(`settings.unit.${unit}`)}</span>}
        </div>
      )
    }
    case "TIME":
      return <input id={id} type="time" disabled={!editable} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className="!w-40" />
    case "ENUM":
      return (
        <div role="radiogroup" aria-labelledby={`${id}-label`}>
          <ChoiceChips disabled={!editable} value={String(value ?? "")} onChange={onChange} options={(def.options ?? []).map((o) => ({ value: o, label: optionLabel(t, o) }))} />
        </div>
      )
    case "LIST": {
      const selected = Array.isArray(value) ? (value as string[]) : []
      if (!def.options) return <input id={id} disabled value={selected.join(", ")} />
      // Order matters (the first language is the default; register columns print in this order), so show it.
      return (
        <div role="group" aria-labelledby={`${id}-label`}>
          <ChoiceChips
            disabled={!editable}
            value={selected}
            onChange={(option) => onChange(selected.includes(option) ? selected.filter((s) => s !== option) : [...selected, option])}
            options={def.options.map((o) => ({ value: o, label: selected.includes(o) ? `${selected.indexOf(o) + 1}. ${optionLabel(t, o)}` : optionLabel(t, o) }))}
          />
        </div>
      )
    }
    case "I18N_TEXT": {
      const texts = (value ?? {}) as Record<string, string>
      return (
        <div className="grid gap-3 md:grid-cols-2">
          {["hi", "en"].map((lang) => (
            <label key={lang} className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-soft">{optionLabel(t, lang)}</span>
              <textarea id={lang === "hi" ? id : undefined} rows={3} disabled={!editable} value={texts[lang] ?? ""} onChange={(e) => onChange({ ...texts, [lang]: e.target.value })} />
            </label>
          ))}
        </div>
      )
    }
    default:
      return <input id={id} disabled={!editable} maxLength={def.maxLength ?? undefined} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
  }
}
