"use client"

/**
 * The same five destinations twice: a thumb-height bar on a phone, a rail down the left on a laptop.
 * Each keeps its own colour so the eye finds it without reading. Each shows only when the role can use it:
 * a housekeeper sees rooms, an accountant sees the money.
 */
import { Suspense } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { AlertTriangle, BarChart3, BedDouble, Building2, CalendarDays, Home, LayoutGrid, MoonStar, Settings, ShieldCheck, UserRound } from "lucide-react"
import { clsx } from "clsx"
import { useI18n } from "@/i18n"
import { api } from "@/lib/api"
import { useSession } from "@/lib/session"
import { useResource } from "@/lib/use-resource"
import { useOperations } from "@/lib/operations-nav"
import { BILLING_TONE, isQuiet, needsAttention, type PropertyHealth } from "@/app/admin/shared"
import { TONE } from "./ui"

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

export function BottomNav() {
  const items = useItems()
  const path = usePathname()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur no-print md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="mx-auto flex max-w-2xl">
        {items.map(({ href, label, icon: Icon, tone }) => {
          const active = isActive(href, path)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex min-h-[58px] flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors",
                  active ? "text-brand-ink" : "text-ink-soft",
                )}
              >
                <span className={clsx("inline-flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-brand-soft")}>
                  <Icon size={20} aria-hidden className={tone} />
                </span>
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** One rail entry; the focus ring sits inside the pill, so a focused active item is not a box around a box. */
function RailLink({ href, label, icon: Icon, tone, active, count }: { href: string; label: string; icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>; tone: string; active: boolean; count?: number }) {
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
        <Icon size={18} aria-hidden className={tone} />
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
