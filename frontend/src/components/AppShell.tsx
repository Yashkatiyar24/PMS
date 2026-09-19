"use client"

/**
 * The frame every screen sits in. A phone gets a slim header and a bottom bar; a laptop gets a rail down the
 * left. Language, text size, appearance and sign-out live in one menu behind the user's initials, so the
 * screen itself carries nothing but the work. The login and guest screens get none of it.
 */
import { useState } from "react"
import { usePathname } from "next/navigation"
import { ArrowLeftRight, Bell, Building2, CalendarPlus, Languages, LogOut, Monitor, Moon, Plus, Search, Sun, Type, UserPlus } from "lucide-react"
import { clsx } from "clsx"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { useUnreadNotifications } from "@/lib/notifications"
import { BottomNav, SideRail } from "./BottomNav"
import { OfflineBar } from "./OfflineBar"
import { SearchBox } from "./SearchBox"
import { Avatar, IconButton, Loading, Logo, Menu, Sheet, type MenuItem } from "./ui"

// Overview screens and a reservation use a laptop's width; forms stay a readable column.
const WIDE = ["/", "/bookings", "/rooms", "/reports", "/settings"]
const wide = (path: string) => WIDE.includes(path) || path.startsWith("/stays/")

function Brand({ name, sub }: { name: string; sub?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Logo />
      <div className="min-w-0">
        <p className="truncate text-[15px] font-extrabold leading-tight tracking-tight">{name}</p>
        {sub && <p className="truncate text-xs text-ink-soft">{sub}</p>}
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const { user, loading, logout, switchProperty } = useSession()
  const { t, language, setLanguage, textSize, setTextSize, theme, setTheme } = useI18n()
  const [searching, setSearching] = useState(false)
  const anonymous = path.startsWith("/g/") || path.startsWith("/book/") || path.startsWith("/login")
  const unread = useUnreadNotifications(!anonymous && !!user?.propertyId)

  // The guest self-registration form and the public booking page are opened by people with no account: they carry themselves.
  if (path.startsWith("/g/") || path.startsWith("/book/")) return <>{children}</>
  if (path.startsWith("/login")) return <main>{children}</main>
  if (loading) return <main className="mx-auto max-w-3xl p-4"><Loading /></main>

  const property = user?.memberships.find((m) => m.propertyId === user.propertyId)
  const name = property?.propertyName ?? t("app.name")

  const themeIcon = { light: Sun, dark: Moon, system: Monitor }[theme]
  // A trust with several properties: see them side by side, or move to another one.
  const others = (user?.memberships ?? []).filter((m) => m.propertyId !== user?.propertyId)
  const menu: MenuItem[] = [
    { label: unread > 0 ? `${t("notif.title")} (${unread})` : t("notif.title"), icon: Bell, href: "/notifications" },
    ...(others.length > 0
      ? [
          { label: t("portfolio.title"), icon: Building2, href: "/portfolio" },
          ...others.map((m) => ({ label: t("portfolio.switchTo", { name: m.propertyName }), icon: ArrowLeftRight, onSelect: () => void switchProperty(m.propertyId).then(() => { window.location.href = "/" }) })),
        ]
      : []),
    { label: `${t("common.language")}: ${language === "hi" ? "English" : "हिंदी"}`, icon: Languages, onSelect: () => setLanguage(language === "hi" ? "en" : "hi"), separator: true },
    { label: `${t("common.textSize")}: ${textSize === "large" ? t("common.normal") : t("common.large")}`, icon: Type, onSelect: () => setTextSize(textSize === "normal" ? "large" : "normal") },
    { label: `${t("common.theme")}: ${t(`theme.${theme === "system" ? "light" : theme === "light" ? "dark" : "system"}`)}`, icon: themeIcon, onSelect: () => setTheme(theme === "system" ? "light" : theme === "light" ? "dark" : "system") },
    { label: t("action.logout"), icon: LogOut, onSelect: () => void logout(), danger: true, separator: true },
  ]

  const userButton = (
    <button aria-label={user?.name ?? t("common.more")} className="relative flex items-center gap-2 rounded-full p-0.5 hover:bg-surface-2">
      <Avatar name={user?.name} size={36} />
      {unread > 0 && <span aria-label={t("notif.title")} className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-surface bg-danger" />}
    </button>
  )

  return (
    <div className="min-h-dvh md:flex">
      {/* Laptop rail */}
      <aside className="no-print sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 md:flex">
        <div className="px-2 pb-5">
          <Brand name={name} sub={user?.role ? user.role.toLowerCase() : undefined} />
        </div>
        <nav className="flex-1"><SideRail /></nav>
        <div className="flex items-center gap-2 border-t border-line pt-3">
          <Menu align="start" trigger={userButton} items={menu} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user?.name}</p>
            <p className="truncate text-xs text-ink-soft">{user?.role?.toLowerCase()}</p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone header */}
        <header className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur md:hidden">
          <Brand name={name} />
          <span className="flex items-center gap-1">
            <IconButton label={t("search.placeholder")} onClick={() => setSearching(true)}><Search size={20} aria-hidden /></IconButton>
            <Menu trigger={userButton} items={menu} />
          </span>
        </header>
        <Sheet open={searching} onOpenChange={setSearching} title={t("search.placeholder")}>
          <SearchBox autoFocus onDone={() => setSearching(false)} className="min-h-[50vh]" />
        </Sheet>

        {/* Laptop top bar: find any stay from any screen, and start the two things the desk starts most. */}
        <div className="no-print sticky top-0 z-10 hidden border-b border-line bg-surface/85 backdrop-blur md:block">
          <div className={clsx("mx-auto flex items-center gap-3 px-8 py-2.5", wide(path) ? "max-w-6xl" : "max-w-3xl")}>
            <SearchBox className="max-w-md flex-1" />
            <Menu
              align="end"
              trigger={<button aria-label={t("action.add")} className="ml-auto grid h-11 w-11 place-items-center rounded-full bg-ink text-bg hover:bg-ink/85"><Plus size={20} aria-hidden /></button>}
              items={[
                { label: t("action.checkIn"), icon: UserPlus, href: "/check-in" },
                { label: t("booking.new"), icon: CalendarPlus, href: "/bookings/new" },
              ]}
            />
          </div>
        </div>

        <OfflineBar />

        <main className={clsx("mx-auto w-full flex-1 px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-8", wide(path) ? "max-w-6xl" : "max-w-3xl")}>{children}</main>
        <BottomNav />
      </div>
    </div>
  )
}
