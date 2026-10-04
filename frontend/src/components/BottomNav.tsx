"use client"

/**
 * The same destinations twice: a thumb-height bar on a phone, a rail down the left on a laptop. The bar carries
 * only what the desk opens all day (today, bookings, rooms) and a More button for the rest; the rail has the
 * height to show everything. Each shows only when the role can use it: a housekeeper sees rooms, an
 * accountant sees the money.
 */
import { Suspense, useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { AlertTriangle, BarChart3, BedDouble, Bell, Building2, CalendarDays, Home, LayoutGrid, MoonStar, Settings, ShieldCheck, UserRound } from "lucide-react"
import { clsx } from "clsx"
import { useI18n } from "@/i18n"
import { api } from "@/lib/api"
import { useSession } from "@/lib/session"
import { useResource } from "@/lib/use-resource"
import { useOperations } from "@/lib/operations-nav"
import { BILLING_TONE, isQuiet, needsAttention, type PropertyHealth } from "@/app/admin/shared"
import { ListCard, ListRow, Sheet, TONE } from "./ui"

function useItems() {
  const { t } = useI18n()
  const { has, user } = useSession()
  const desk = has("reservations.view")
  const platform = { href: "/admin", label: t("admin.title"), icon: ShieldCheck, tone: "text-warn" }
  // A platform admin working in no property has nothing but the platform to see; one who also runs a
  // property gets it beside their own screens.
  if (user?.superAdmin && !user.propertyId) return [platform]
  return [
    ...(desk ? [{ href: "/", label: t("nav.today"), icon: Home, tone: "text-brand" }] : []),
    ...(desk ? [{ href: "/guests", label: t("guests.title"), icon: UserRound, tone: "text-warn" }] : []),
    ...(desk ? [{ href: "/bookings", label: t("nav.bookings"), icon: CalendarDays, tone: "text-violet" }] : []),
    ...(desk || has("housekeeping") || has("maintenance") ? [{ href: "/rooms", label: t("nav.rooms"), icon: BedDouble, tone: "text-teal" }] : []),
    ...(has("revenue.view") ? [{ href: "/reports", label: t("nav.reports"), icon: BarChart3, tone: "text-ok" }] : []),
    { href: "/settings", label: t("nav.settings"), icon: Settings, tone: "text-ink-soft" },
    ...(user?.superAdmin ? [platform] : []),
  ]
}

const isActive = (href: string, path: string) =>
  href === "/" ? path === "/" || path.startsWith("/check-in") || path.startsWith("/stays") : path.startsWith(href)

/** What stays on the phone bar: the screens the desk opens all day. The rest are rows behind More. */
const ON_BAR = new Set(["/", "/bookings", "/rooms", "/admin"])

export function BottomNav() {
  const { t } = useI18n()
  const { user } = useSession()
  const items = useItems()
  const operations = useOperations()
  const path = usePathname()
  // The sheet remembers which screen it was opened on; a row is a link, so once the screen behind it has
  // changed the sheet is simply no longer open, with no effect to run.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const more = openOn === path
  const setMore = (open: boolean) => setOpenOn(open ? path : null)
  const bar = items.filter((i) => ON_BAR.has(i.href))
  const rest = items.filter((i) => !ON_BAR.has(i.href))
  const extras = [
    { href: "/notifications", label: t("notif.title"), icon: Bell },
    ...((user?.memberships.length ?? 0) > 1 ? [{ href: "/portfolio", label: t("portfolio.title"), icon: Building2 }] : []),
  ]
  const behindMore = [...rest, ...operations, ...extras]
  const moreActive = behindMore.some((i) => isActive(i.href, path))
  const entry = "flex min-h-[58px] w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors"
  const pill = "inline-flex h-7 w-12 items-center justify-center rounded-full transition-colors"
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 bg-surface/95 shadow-[0_-6px_24px_rgb(31_45_61/0.08)] backdrop-blur no-print md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="mx-auto flex max-w-2xl">
        {bar.map(({ href, label, icon: Icon }) => {
          const active = isActive(href, path)
          return (
            <li key={href} className="flex-1">
              <Link href={href} aria-current={active ? "page" : undefined} className={clsx(entry, active ? "text-brand-ink" : "text-ink-soft")}>
                <span className={clsx(pill, active && "bg-brand-soft")}>
                  <Icon size={20} aria-hidden strokeWidth={active ? 2.2 : 1.75} />
                </span>
                {label}
              </Link>
            </li>
          )
        })}
        {behindMore.length > 0 && (
          <li className="flex-1">
            <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" aria-expanded={more} className={clsx(entry, moreActive ? "text-brand-ink" : "text-ink-soft")}>
              <span className={clsx(pill, moreActive && "bg-brand-soft")}>
                <LayoutGrid size={20} aria-hidden strokeWidth={moreActive ? 2.2 : 1.75} />
              </span>
              {t("common.more")}
            </button>
          </li>
        )}
      </ul>
      {/* The rest of the app, one row each: screens, then the day's modules, then the account's own pages. */}
      <Sheet open={more} onOpenChange={setMore} title={t("common.more")}>
        <div className="space-y-3 pb-2">
          {[rest, operations, extras].map((group, g) =>
            group.length > 0 ? (
              <ListCard key={g}>
                {group.map(({ href, label, icon: Icon }) => (
                  <ListRow
                    key={href}
                    href={href}
                    title={label}
                    leading={<span className={clsx("inline-flex h-9 w-9 items-center justify-center rounded-xl", isActive(href, path) ? "bg-brand-soft text-brand-ink" : "bg-surface-2 text-ink-soft")}><Icon size={18} aria-hidden /></span>}
                  />
                ))}
              </ListCard>
            ) : null,
          )}
        </div>
      </Sheet>
    </nav>
  )
}

/** One rail entry; the focus ring sits inside the pill, so a focused active item is not a box around a box. */
function RailLink({ href, label, icon: Icon, active, count }: { href: string; label: string; icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>; tone: string; active: boolean; count?: number }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={clsx(
          "flex min-h-[42px] items-center gap-3 rounded-lg px-3 text-[14px] font-semibold transition-colors focus-visible:-outline-offset-2!",
          active ? "bg-brand-soft text-brand-ink" : "text-ink-soft hover:bg-surface-2 hover:text-ink",
        )}
      >
        <Icon size={18} aria-hidden strokeWidth={active ? 2.2 : 1.75} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined && count > 0 && (
          <span className={clsx("rounded-full px-2 py-0.5 text-[11px] tabular-nums", active ? "bg-raised text-brand-ink" : "bg-surface-2 text-ink-soft")}>{count}</span>
        )}
      </Link>
    </li>
  )
}

/** More than this and the rail stops being a shortcut; the list page has search and sorting for the rest. */
const RAIL_PROPERTIES = 12

/**
 * The platform admin's rail: the two lists worth a daily look, with how many are on each, then every property
 * a click away. The filters live in the URL so the rail and the list page agree on which one is open.
 */
function PlatformRail({ path }: { path: string }) {
  const { t } = useI18n()
  const filter = useSearchParams().get("filter")
  // Refetched on each navigation, so the counts follow what was just changed on a property's page.
  const { data } = useResource(() => api<PropertyHealth[]>("/api/admin/properties"), [path], "")
  const properties = data ?? []
  const onList = path === "/admin"
  const group = "mb-1.5 mt-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint"
  return (
    <>
      <ul className="space-y-0.5">
        <RailLink href="/admin" label={t("admin.title")} icon={ShieldCheck} tone="text-warn" active={onList && !filter} />
        <RailLink href="/admin?filter=attention" label={t("admin.attention")} icon={AlertTriangle} tone="text-danger" count={properties.filter(needsAttention).length} active={onList && filter === "attention"} />
        <RailLink href="/admin?filter=quiet" label={t("admin.quiet")} icon={MoonStar} tone="text-violet" count={properties.filter((p) => isQuiet(p)).length} active={onList && filter === "quiet"} />
      </ul>
      {properties.length > 0 && (
        <>
          <p className={group}>{t("admin.properties")}</p>
          <ul className="space-y-0.5">
            {[...properties].sort((a, b) => a.propertyName.localeCompare(b.propertyName)).slice(0, RAIL_PROPERTIES).map((p) => (
              <RailLink key={p.propertyId} href={`/admin/${p.propertyId}`} label={p.propertyName} icon={Building2}
                tone={TONE[p.active ? BILLING_TONE[p.billingStatus] ?? "neutral" : "neutral"].text} active={path === `/admin/${p.propertyId}`} />
            ))}
            {properties.length > RAIL_PROPERTIES && (
              <RailLink href="/admin" label={t("admin.moreProperties", { n: properties.length })} icon={LayoutGrid} tone="text-ink-soft" active={false} />
            )}
          </ul>
        </>
      )}
    </>
  )
}

/**
 * The laptop rail: the five destinations, then the day's other work (guests, maintenance, expenses, ...) that a
 * phone reaches through Settings. A laptop has the height to show them, and the desk should not dig for them.
 */
export function SideRail({ children }: { children?: React.ReactNode }) {
  const { t } = useI18n()
  const { user } = useSession()
  const items = useItems()
  const operations = useOperations()
  const path = usePathname()
  // Reading the URL's query needs a Suspense boundary so the rest of the shell can still be prerendered.
  if (user?.superAdmin && !user.propertyId) return <Suspense fallback={null}><PlatformRail path={path} /></Suspense>
  return (
    <>
      <ul className="space-y-0.5">
        {items.map(({ href, label, icon, tone }) => <RailLink key={href} href={href} label={label} icon={icon} tone={tone} active={isActive(href, path)} />)}
        {children}
      </ul>
      {operations.length > 0 && (
        <>
          <p className="mb-1.5 mt-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{t("settings.operationsGroup")}</p>
          <ul className="space-y-0.5">
            {operations.map(({ href, label, icon, tone }) => <RailLink key={href} href={href} label={label} icon={icon} tone={TONE[tone].text} active={path.startsWith(href)} />)}
          </ul>
        </>
      )}
    </>
  )
}
