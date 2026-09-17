"use client"

/** Five destinations, thumb-height, always visible. Reports and Settings need a manager. */
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, BedDouble, CalendarDays, Home, Settings } from "lucide-react"
import { clsx } from "clsx"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"

export function BottomNav() {
  const { t } = useI18n()
  const { can } = useSession()
  const path = usePathname()

  const items = [
    { href: "/", label: t("nav.today"), icon: Home },
    { href: "/bookings", label: t("nav.bookings"), icon: CalendarDays },
    { href: "/rooms", label: t("nav.rooms"), icon: BedDouble },
    ...(can("MANAGER") ? [{ href: "/reports", label: t("nav.reports"), icon: BarChart3 }] : []),
    { href: "/settings", label: t("nav.settings"), icon: Settings },
  ]

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-line)] bg-[var(--color-surface)] no-print">
      <ul className="mx-auto flex max-w-2xl">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-[var(--color-brand)]" : "text-[var(--color-ink-soft)]",
                )}
              >
                <Icon size={20} aria-hidden />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
