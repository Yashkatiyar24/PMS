"use client"

/**
 * Our back office, not the property's. Only a super-admin can open it, and the server enforces that; this
 * screen shows counts and billing state rather than anything about a guest, because guest data belongs to
 * the property and support may see it only inside a window the owner opens.
 *
 * One glance answers the platform's daily questions: how many properties there are, which have guests in
 * tonight, who is behind on billing, who has gone quiet and whose messages are stuck. The list can be read as
 * cards or as a table, sorted by what matters today, and taken away as a spreadsheet.
 */
import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { BedDouble, Building2, CalendarDays, CreditCard, Download, IndianRupee, LayoutGrid, List, MessageSquare, Plus, Search, Users } from "lucide-react"
import { clsx } from "clsx"
import { api, ApiError } from "@/lib/api"
import { formatDateTime, rupees } from "@/lib/format"
import { useResource } from "@/lib/use-resource"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { Avatar, Banner, Button, Chip, ChoiceChips, Empty, Field, Loading, PageHeader, PhoneInput, Segmented, Sheet, StatTile, TONE } from "@/components/ui"
import { Credentials } from "@/components/Credentials"
import { BILLING_TONE, isQuiet, needsAttention, QUIET_DAYS, type Plan, type PropertyHealth } from "./shared"

type Onboarded = { propertyId: string; code: string; ownerEmail: string; ownerPassword?: string | null }
type Filter = "all" | "trial" | "active" | "attention" | "quiet"
type Sort = "name" | "lastUsed" | "outstanding" | "stayingNow" | "rooms"
type View = "cards" | "list"
const EMPTY_FORM = { orgName: "", propertyName: "", city: "", state: "", phone: "", ownerName: "", ownerPhone: "", ownerEmail: "", planCode: "basic" }

/** Cards or a table is a matter of taste and screen; the choice is kept on this device. */
const VIEW_KEY = "pms.admin.view"
const readView = (): View => { try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "cards" } catch { return "cards" } }

const SORTERS: Record<Sort, (a: PropertyHealth, b: PropertyHealth) => number> = {
  name: (a, b) => a.propertyName.localeCompare(b.propertyName),
  lastUsed: (a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""),
  outstanding: (a, b) => b.outstandingPaise - a.outstandingPaise,
  stayingNow: (a, b) => b.stayingNow - a.stayingNow,
  rooms: (a, b) => b.rooms - a.rooms,
}

/** The list as a spreadsheet, for whoever keeps one. Money in rupees, dates as the server sent them. */
function toCsv(rows: PropertyHealth[], planName: (code: string) => string) {
  const head = ["name", "code", "city", "trust", "plan", "billing", "on", "rooms", "staying_now", "bookings_30d", "unpaid_rupees", "last_used", "owner", "owner_phone"]
  // A name beginning with = or + would run as a formula when the file is opened; a leading quote keeps it text.
  const cell = (v: unknown) => { const s = String(v ?? ""); return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"` }
  const lines = rows.map((p) =>
    [p.propertyName, p.code, p.city, p.orgName, planName(p.plan), p.billingStatus, p.active, p.rooms, p.stayingNow, p.bookingsLast30Days, p.outstandingPaise / 100, p.lastActivityAt ?? "", p.ownerName ?? "", p.ownerPhone ?? ""].map(cell).join(","),
  )
  return [head.join(","), ...lines].join("\n")
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }))
  const a = Object.assign(document.createElement("a"), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
}

/** Reading the URL's query suspends during prerendering, so the page proper sits inside a boundary. */
export default function AdminPage() {
  return <Suspense fallback={<Loading />}><PlatformList /></Suspense>
}

const FILTERS: Filter[] = ["all", "trial", "active", "attention", "quiet"]

function PlatformList() {
  const { t } = useI18n()
  const { user, loading } = useSession()
  const router = useRouter()
  // The filter is the URL, so the rail's "Needs attention" and this screen's tab are the same thing.
  const wanted = useSearchParams().get("filter") as Filter | null
  const filter: Filter = wanted && FILTERS.includes(wanted) ? wanted : "all"
  const setFilter = (f: Filter) => router.replace(f === "all" ? "/admin" : `/admin?filter=${f}`)
  const { data, error: loadError, reload } = useResource(
    async () => {
      const [properties, plans] = await Promise.all([api<PropertyHealth[]>("/api/admin/properties"), api<Plan[]>("/api/admin/plans")])
      return { properties, plans }
    },
    [],
    t("error.generic"),
  )

  const [sort, setSort] = useState<Sort>("name")
  const [view, setView] = useState<View>(readView)
  const [query, setQuery] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState<Onboarded | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  if (loading) return <Loading />
  if (!user?.superAdmin) return <Empty>{t("error.generic")}</Empty>

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError("")
    try {
      await action()
      reload()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
    } finally {
      setBusy(false)
    }
  }

  const changeView = (v: View) => { setView(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* not remembered */ } }
  const properties = data?.properties ?? []
  const plans = data?.plans ?? []
  const planName = (code: string) => plans.find((p) => p.code === code)?.name ?? code
  const status = (s: string) => t(`admin.status.${s}` as "admin.status.trial")
  const sum = (pick: (p: PropertyHealth) => number) => properties.reduce((n, p) => n + pick(p), 0)
  const matches: Record<Filter, (p: PropertyHealth) => boolean> = {
    all: () => true,
    trial: (p) => p.billingStatus === "trial",
    active: (p) => p.billingStatus === "active",
    attention: needsAttention,
    quiet: (p) => isQuiet(p),
  }
  const counts = Object.fromEntries((Object.keys(matches) as Filter[]).map((k) => [k, properties.filter(matches[k]).length])) as Record<Filter, number>
  const q = query.trim().toLowerCase()
  const shown = properties
    .filter(matches[filter])
    .filter((p) => !q || [p.propertyName, p.code, p.orgName, p.city].some((s) => s.toLowerCase().includes(q)))
    .sort(SORTERS[sort])
  const outstanding = sum((p) => p.outstandingPaise)
  const pending = sum((p) => p.outboxPending)
  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }) })
  const onboard = <Button size="sm" onClick={() => { setAdding(true); setAdded(null) }}><Plus size={16} aria-hidden /> {t("admin.onboard")}</Button>

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("admin.title")}
        subtitle={t("admin.subtitle")}
        actions={
          <>
            {properties.length > 0 && (
              <Button size="sm" variant="secondary" onClick={() => download(`properties-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(shown, planName))}>
                <Download size={16} aria-hidden /> <span className="hidden sm:inline">{t("admin.export")}</span>
              </Button>
            )}
            {onboard}
          </>
        }
      />
      {(error || loadError) && <Banner tone="danger" onClose={() => setError("")}>{error || loadError}</Banner>}

      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label={t("admin.properties")} value={properties.length} icon={Building2} tone="brand" hint={`${counts.active} ${status("active").toLowerCase()} · ${counts.trial} ${status("trial").toLowerCase()}`} />
            <StatTile label={t("admin.roomsCount")} value={sum((p) => p.rooms)} icon={BedDouble} tone="teal" />
            <StatTile label={t("today.inHouse")} value={sum((p) => p.stayingNow)} icon={Users} tone="violet" />
            <StatTile label={t("admin.recentBookings")} value={sum((p) => p.bookingsLast30Days)} icon={CalendarDays} tone="ok" />
            <StatTile label={t("reports.outstanding")} value={rupees(outstanding)} icon={IndianRupee} tone={outstanding > 0 ? "danger" : "ok"} hint={t("admin.openBillsCount", { n: sum((p) => p.openFolios) })} />
            <StatTile label={t("admin.outbox")} value={pending} icon={MessageSquare} tone={pending > 0 ? "warn" : "neutral"} />
          </div>

          {/* Two rows on every screen: five filter tabs and three controls do not share a laptop's width. */}
          <div className="space-y-3">
            <Segmented
              value={filter}
              onChange={setFilter}
              items={[
                { value: "all", label: t("common.all"), count: counts.all, tone: "brand" },
                { value: "trial", label: status("trial"), count: counts.trial, tone: "brand" },
                { value: "active", label: status("active"), count: counts.active, tone: "ok" },
                { value: "attention", label: t("admin.attention"), count: counts.attention, tone: "warn" },
                { value: "quiet", label: t("admin.quiet"), count: counts.quiet, tone: "neutral" },
              ]}
            />
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-ink-soft">
                <span className="whitespace-nowrap">{t("admin.sort")}</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="!w-auto">
                  <option value="name">{t("admin.sort.name")}</option>
                  <option value="lastUsed">{t("admin.lastActivity")}</option>
                  <option value="outstanding">{t("reports.outstanding")}</option>
                  <option value="stayingNow">{t("today.inHouse")}</option>
                  <option value="rooms">{t("admin.roomsCount")}</option>
                </select>
              </label>
              <span role="group" className="flex rounded-full bg-surface-2 p-1">
                {([["cards", LayoutGrid, t("admin.view.cards")], ["list", List, t("admin.view.list")]] as const).map(([v, Icon, label]) => (
                  <button key={v} type="button" aria-pressed={view === v} aria-label={label} title={label} onClick={() => changeView(v)}
                    className={clsx("grid h-9 w-9 place-items-center rounded-full transition-colors", view === v ? "bg-raised text-ink shadow-[var(--shadow-card)]" : "text-ink-soft hover:text-ink")}>
                    <Icon size={16} aria-hidden />
                  </button>
                ))}
              </span>
              <label className="relative block w-full sm:ml-auto sm:w-72">
                <span className="sr-only">{t("admin.search")}</span>
                <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("admin.search")} className="!rounded-full !pl-10" />
              </label>
            </div>
          </div>

          {properties.length === 0 ? (
            <Empty icon={Building2} action={onboard}>{t("admin.none")}</Empty>
          ) : shown.length === 0 ? (
            <Empty icon={Search}>{t("admin.noMatch")}</Empty>
          ) : view === "list" ? (
            <PropertyRows properties={shown} planName={planName} status={status} />
          ) : (
            <PropertyCards properties={shown} planName={planName} status={status} />
          )}
        </>
      )}

      <Sheet open={adding} onOpenChange={setAdding} title={t("admin.onboard")} wide
        footer={
          <Button size="lg" className="w-full"
            disabled={busy || !form.orgName.trim() || !form.propertyName.trim() || !form.ownerName.trim() || form.ownerPhone.replace(/\D/g, "").length < 10 || !form.ownerEmail.includes("@")}
            onClick={() => run(async () => { setAdded(await api<Onboarded>("/api/admin/properties", { method: "POST", body: form })); setAdding(false); setForm(EMPTY_FORM) })}>
            <CreditCard size={18} aria-hidden /> {t("action.save")}
          </Button>
        }>
        <div className="space-y-3">
          <Field label={t("admin.trust")}><input {...field("orgName")} autoFocus /></Field>
          <Field label={t("setup.name")}><input {...field("propertyName")} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("setup.city")}><input {...field("city")} /></Field>
            <Field label={t("setup.state")}><input {...field("state")} /></Field>
          </div>
          <Field label={t("setup.phone")}><input inputMode="tel" {...field("phone")} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("admin.ownerName")}><input {...field("ownerName")} /></Field>
            <Field label={t("admin.ownerPhone")}><PhoneInput value={form.ownerPhone} onChange={(digits) => setForm({ ...form, ownerPhone: digits })} /></Field>
          </div>
          <Field label={t("admin.ownerEmail")} hint={t("admin.ownerEmailHint")}><input type="email" {...field("ownerEmail")} placeholder="name@example.in" /></Field>
          <Field group label={t("admin.plan")}>
            <ChoiceChips value={form.planCode} onChange={(planCode) => setForm({ ...form, planCode })} options={plans.map((p) => ({ value: p.code, label: p.name }))} />
          </Field>
        </div>
      </Sheet>

      <Sheet open={!!added} onOpenChange={(o) => !o && setAdded(null)} title={t("admin.onboarded")} description={t("credentials.title")}>
        {added && <Credentials code={added.code} email={added.ownerEmail} password={added.ownerPassword} />}
      </Sheet>
    </div>
  )
}

/** The state chips a property carries in either view: billing, quiet, stuck messages. */
function Flags({ p, status }: { p: PropertyHealth; status: (s: string) => string }) {
  const { t } = useI18n()
  const tone = p.active ? BILLING_TONE[p.billingStatus] ?? "neutral" : "neutral"
  return (
    <>
      <Chip tone={tone} dot className="shadow-[var(--shadow-card)]">{p.active ? status(p.billingStatus) : t("admin.inactiveShort")}</Chip>
      {isQuiet(p) && <Chip tone="neutral" className="shadow-[var(--shadow-card)]" title={t("admin.quietHint", { n: QUIET_DAYS })}>{t("admin.quiet")}</Chip>}
      {p.outboxPending > 0 && <Chip tone="warn" className="shadow-[var(--shadow-card)]">{p.outboxPending} {t("admin.outbox").toLowerCase()}</Chip>}
    </>
  )
}

type ListProps = { properties: PropertyHealth[]; planName: (code: string) => string; status: (s: string) => string }

/**
 * One card per property: its photograph (or a quiet placeholder), its state, who runs it and the three
 * numbers that say whether it is alive. Everything else is one tap away on the property's own page.
 */
function PropertyCards({ properties, planName, status }: ListProps) {
  const { t } = useI18n()
  const stat = (label: string, value: number) => (
    <div className="min-w-0">
      <dt className="truncate text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="text-lg font-bold tabular-nums leading-tight">{value}</dd>
    </div>
  )
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {properties.map((p) => {
        const tone = p.active ? BILLING_TONE[p.billingStatus] ?? "neutral" : "neutral"
        return (
          <li key={p.propertyId}>
            <Link
              href={`/admin/${p.propertyId}`}
              className="flex h-full flex-col press overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] focus-visible:-outline-offset-2!"
            >
              <div className="relative aspect-[16/9] bg-surface-2">
                {p.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className={clsx("flex h-full w-full items-center justify-center", TONE[tone].soft)}>
                    <Building2 size={44} aria-hidden className={TONE[tone].text} />
                  </div>
                )}
                <span className="absolute right-3 top-3 flex flex-col items-end gap-1"><Flags p={p} status={status} /></span>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-[17px] font-bold leading-snug">{p.propertyName}</p>
                  <p className="truncate text-sm text-ink-soft"><span className="font-mono">{p.code}</span>{p.city && ` · ${p.city}`}</p>
                  <p className="truncate text-sm text-ink-soft">{p.orgName} · {planName(p.plan)}</p>
                </div>
                <dl className="grid grid-cols-3 gap-3 rounded-xl bg-surface-2 px-3 py-2">
                  {stat(t("admin.roomsCount"), p.rooms)}
                  {stat(t("today.inHouse"), p.stayingNow)}
                  {stat(t("admin.col.last30"), p.bookingsLast30Days)}
                </dl>
                <p className="mt-auto truncate text-xs text-ink-faint">{t("admin.lastActivity")} · {p.lastActivityAt ? formatDateTime(p.lastActivityAt) : t("admin.never")}</p>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** The same properties as a table, for a platform with more of them than fit in cards. Stacked rows on a phone. */
function PropertyRows({ properties, planName, status }: ListProps) {
  const { t } = useI18n()
  const cols = "md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_4rem_5.5rem_4.5rem_6rem_9rem_8rem] md:items-center md:gap-4"
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)]">
      <div className={clsx("hidden bg-surface-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-soft", cols)}>
        <span>{t("admin.col.property")}</span>
        <span>{t("admin.col.trust")}</span>
        <span className="text-right">{t("admin.roomsCount")}</span>
        <span className="text-right">{t("today.inHouse")}</span>
        <span className="text-right">{t("admin.col.last30")}</span>
        <span className="text-right">{t("admin.col.unpaid")}</span>
        <span>{t("admin.lastActivity")}</span>
        <span className="text-right">{t("admin.billing")}</span>
      </div>
      <ul className="divide-y divide-line">
        {properties.map((p) => (
          <li key={p.propertyId}>
            <Link href={`/admin/${p.propertyId}`} className={clsx("flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2", cols)}>
              <span className="flex min-w-0 flex-1 items-center gap-3">
                {p.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photoUrl} alt="" className="h-[38px] w-[38px] shrink-0 rounded-full bg-surface-2 object-cover" />
                ) : (
                  <Avatar name={p.propertyName} tone={p.active ? BILLING_TONE[p.billingStatus] ?? "neutral" : "neutral"} icon={Building2} size={38} />
                )}
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.propertyName}</span>
                  <span className="block truncate text-xs text-ink-soft md:hidden">{p.code}{p.city && ` · ${p.city}`} · {p.orgName} · {p.rooms} {t("admin.roomsCount").toLowerCase()}</span>
                  <span className="hidden truncate text-xs text-ink-soft md:block"><span className="font-mono">{p.code}</span>{p.city && ` · ${p.city}`}</span>
                </span>
              </span>
              <span className="hidden min-w-0 md:block">
                <span className="block truncate text-sm">{p.orgName}</span>
                <span className="block truncate text-xs text-ink-soft">{planName(p.plan)}</span>
              </span>
              <span className="hidden text-right tabular-nums md:block">{p.rooms}</span>
              <span className="hidden text-right tabular-nums md:block">{p.stayingNow}</span>
              <span className="hidden text-right tabular-nums md:block">{p.bookingsLast30Days}</span>
              <span className={clsx("hidden text-right tabular-nums md:block", p.outstandingPaise > 0 && "font-semibold text-danger")}>{rupees(p.outstandingPaise)}</span>
              <span className="hidden whitespace-nowrap text-sm text-ink-soft md:block">{p.lastActivityAt ? formatDateTime(p.lastActivityAt) : t("admin.never")}</span>
              <span className="flex shrink-0 flex-col items-end gap-1"><Flags p={p} status={status} /></span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
