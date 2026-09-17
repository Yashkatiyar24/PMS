"use client"

/**
 * The frame every screen sits in. A phone gets a slim header and a bottom bar; a laptop gets a rail down the
 * left. Language, text size, appearance and sign-out live in one menu behind the user's initials, so the
 * screen itself carries nothing but the work. The login and guest screens get none of it.
 */
import { usePathname } from "next/navigation"
import { Languages, LogOut, Monitor, Moon, Sun, Type } from "lucide-react"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { BottomNav, SideRail } from "./BottomNav"
import { OfflineBar } from "./OfflineBar"
import { Avatar, Loading, Menu, type MenuItem } from "./ui"

function Brand({ name, sub }: { name: string; sub?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand text-white shadow-sm">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" />
        </svg>
      </span>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-bold leading-tight">{name}</p>
        {sub && <p className="truncate text-xs text-ink-soft">{sub}</p>}
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const { user, loading, logout } = useSession()
  const { t, language, setLanguage, textSize, setTextSize, theme, setTheme } = useI18n()

  // The guest self-registration form is opened by someone with no account: it carries itself.
  if (path.startsWith("/g/")) return <>{children}</>
  if (path.startsWith("/login")) return <main className="mx-auto min-h-dvh max-w-md p-4">{children}</main>
  if (loading) return <main className="mx-auto max-w-3xl p-4"><Loading /></main>

  const property = user?.memberships.find((m) => m.propertyId === user.propertyId)
  const name = property?.propertyName ?? t("app.name")

  const themeIcon = { light: Sun, dark: Moon, system: Monitor }[theme]
  const menu: MenuItem[] = [
    { label: `${t("common.language")}: ${language === "hi" ? "English" : "हिंदी"}`, icon: Languages, onSelect: () => setLanguage(language === "hi" ? "en" : "hi") },
    { label: `${t("common.textSize")}: ${textSize === "large" ? t("common.normal") : t("common.large")}`, icon: Type, onSelect: () => setTextSize(textSize === "normal" ? "large" : "normal") },
    { label: `${t("common.theme")}: ${t(`theme.${theme === "system" ? "light" : theme === "light" ? "dark" : "system"}`)}`, icon: themeIcon, onSelect: () => setTheme(theme === "system" ? "light" : theme === "light" ? "dark" : "system") },
    { label: t("action.logout"), icon: LogOut, onSelect: () => void logout(), danger: true, separator: true },
  ]

  const userButton = (
    <button aria-label={user?.name ?? t("common.more")} className="flex items-center gap-2 rounded-full p-0.5 hover:bg-surface-2">
      <Avatar name={user?.name} size={36} />
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
          <Menu trigger={userButton} items={menu} />
        </header>

        <OfflineBar />

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-8">{children}</main>
        <BottomNav />
      </div>
    </div>
  )
}
