"use client"

/**
 * The same five destinations twice: a thumb-height bar on a phone, a rail down the left on a laptop.
 * Each keeps its own colour so the eye finds it without reading. Reports and Settings need a manager.
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, BedDouble, CalendarDays, Home, Settings } from "lucide-react"
import { clsx } from "clsx"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"

function useItems() {
  const { t } = useI18n()
  const { can } = useSession()
  return [
    { href: "/", label: t("nav.today"), icon: Home, tone: "text-brand" },
    { href: "/bookings", label: t("nav.bookings"), icon: CalendarDays, tone: "text-violet" },
    { href: "/rooms", label: t("nav.rooms"), icon: BedDouble, tone: "text-teal" },
    ...(can("MANAGER") ? [{ href: "/reports", label: t("nav.reports"), icon: BarChart3, tone: "text-ok" }] : []),
    { href: "/settings", label: t("nav.settings"), icon: Settings, tone: "text-ink-soft" },
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

export function SideRail({ children }: { children?: React.ReactNode }) {
  const items = useItems()
  const path = usePathname()
  return (
    <ul className="space-y-0.5">
      {items.map(({ href, label, icon: Icon, tone }) => {
        const active = isActive(href, path)
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex min-h-[42px] items-center gap-3 rounded-lg px-3 text-[14px] font-semibold transition-colors",
                active ? "bg-brand-soft text-brand-ink" : "text-ink-soft hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon size={18} aria-hidden className={tone} />
              {label}
            </Link>
          </li>
        )
      })}
      {children}
    </ul>
  )
}
