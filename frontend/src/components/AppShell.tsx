"use client"

/**
 * The frame every screen sits in. A phone gets a slim header and a bottom bar; a laptop gets a rail down the
 * left. Language, text size, appearance and sign-out live in one menu behind the user's initials, so the
 * screen itself carries nothing but the work. The login and guest screens get none of it.
 */
import { useState } from "react"
import { usePathname } from "next/navigation"
import { ArrowLeftRight, Bell, Building2, CalendarPlus, KeyRound, Languages, Lock, LogOut, Monitor, Moon, Plus, Search, Sun, Type, UserPlus } from "lucide-react"
import { clsx } from "clsx"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { useUnreadNotifications } from "@/lib/notifications"
import { ChangePassword } from "./ChangePassword"
import { BottomNav, SideRail } from "./BottomNav"
import { OfflineBar } from "./OfflineBar"
import { SearchBox } from "./SearchBox"
import { Avatar, Banner, Button, Empty, IconButton, Loading, Logo, Menu, Sheet, Wordmark, type MenuItem } from "./ui"
import { isGuestScreen, isPublicScreen } from "@/lib/public-screens"

// Every working screen uses a laptop's width and puts its context beside its content (see SplitPage). Only
// screens that are a single readable thing, such as one guest's record, keep the narrow column.
const NARROW = ["/needs-attention"]
const wide = (path: string) => !NARROW.includes(path) && !path.startsWith("/guests/")

function Brand({ name, sub, wrap, mark }: { name: string; sub?: string; wrap?: boolean; mark?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Logo />
      <div className="min-w-0">
        {/* The property's name, or the product's own wordmark for someone who runs no property. */}
        {mark ? (
          <Wordmark label={name} className="h-[15px]" />
        ) : (
          /* The rail has height to spare, so a long name takes two lines there rather than an ellipsis. */
          <p className={clsx("text-[15px] font-extrabold leading-tight tracking-tight", wrap ? "line-clamp-2" : "truncate")}>{name}</p>
        )}
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
  const [changingPassword, setChangingPassword] = useState(false)
  const anonymous = isPublicScreen(path)
  const unread = useUnreadNotifications(!anonymous && !!user?.propertyId)

  // The guest self-registration form and the public booking page are opened by people with no account: they carry themselves.
  // A guest's own screen draws its own page; wrapping it in the desk's chrome would show a stranger the
  // navigation of a system they have no account for.
  if (isGuestScreen(path)) return <>{children}</>
  if (path.startsWith("/login")) return <main>{children}</main>
  if (loading) return <main className="mx-auto max-w-3xl p-4"><Loading /></main>

  const property = user?.memberships.find((m) => m.propertyId === user.propertyId)
  const name = property?.propertyName ?? t("app.name")

  const themeIcon = { light: Sun, dark: Moon, system: Monitor }[theme]
  // A trust with several properties: see them side by side, or move to another one.
  const others = (user?.memberships ?? []).filter((m) => m.propertyId !== user?.propertyId)

  // An unpaid subscription is between the trust and the platform. The server refuses the property's requests;
  // this says why, in one place, instead of every screen failing on its own.
  const billing = user?.propertyId ? user.billingStatus : null
  if (billing === "closed") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 p-6">
        <Empty icon={Lock}>{t("billing.closed")}</Empty>
        {others.map((m) => (
          <Button key={m.propertyId} variant="soft" onClick={() => void switchProperty(m.propertyId).then(() => { window.location.href = "/" })}>
            <ArrowLeftRight size={18} aria-hidden /> {t("portfolio.switchTo", { name: m.propertyName })}
          </Button>
        ))}
        <Button variant="secondary" onClick={() => void logout()}><LogOut size={18} aria-hidden /> {t("action.logout")}</Button>
      </main>
    )
  }
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
    { label: t("account.changePassword"), icon: KeyRound, onSelect: () => setChangingPassword(true), separator: true },
    { label: t("action.logout"), icon: LogOut, onSelect: () => void logout(), danger: true },
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
          <Brand name={name} sub={user?.role ? user.role.toLowerCase() : undefined} wrap mark={!property} />
        </div>
        <nav className="scroll-thin min-h-0 flex-1 overflow-y-auto"><SideRail /></nav>
        <div className="flex items-center gap-2 border-t border-line pt-3">
          <Menu align="start" trigger={userButton} items={menu} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user?.name}</p>
            <p className="truncate text-xs text-ink-soft">{user?.role?.toLowerCase()}</p>
          </div>
          {/* Sign-out in plain sight on a shared desk computer; the menu keeps it too. */}
          <IconButton label={t("action.logout")} onClick={() => void logout()} className="hover:text-danger"><LogOut size={18} aria-hidden /></IconButton>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone header */}
        <header className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur md:hidden">
          <Brand name={name} mark={!property} />
          <span className="flex items-center gap-1">
            {user?.propertyId && <IconButton label={t("search.placeholder")} onClick={() => setSearching(true)}><Search size={20} aria-hidden /></IconButton>}
            <Menu trigger={userButton} items={menu} />
          </span>
        </header>
        <Sheet open={searching} onOpenChange={setSearching} title={t("search.placeholder")}>
          <SearchBox autoFocus onDone={() => setSearching(false)} className="min-h-[50vh]" />
        </Sheet>
        <ChangePassword open={changingPassword || !!user?.mustChangePassword} onOpenChange={setChangingPassword} required={!!user?.mustChangePassword} />

        {/* Laptop top bar: find any stay from any screen, and start the two things the desk starts most.
            A platform admin in no property has no stays to find and nothing to start, so they get no bar. */}
        {user?.propertyId && <div className="no-print sticky top-0 z-10 hidden border-b border-line bg-surface/85 backdrop-blur md:block">
          <div className={clsx("mx-auto flex items-center gap-3 px-8 py-2.5", wide(path) ? "max-w-6xl" : "max-w-3xl")}>
            <SearchBox className="max-w-md flex-1" />
            <Menu
              align="end"
              trigger={<button aria-label={t("action.add")} className="cta press ml-auto grid h-11 w-11 place-items-center rounded-full text-on-solid shadow-[var(--shadow-cta)]"><Plus size={20} aria-hidden /></button>}
              items={[
                { label: t("action.checkIn"), icon: UserPlus, href: "/check-in" },
                { label: t("booking.new"), icon: CalendarPlus, href: "/bookings/new" },
              ]}
            />
          </div>
        </div>}

        {(billing === "overdue" || billing === "readonly") && (
          <div className="px-4 pt-3 md:px-8">
            <Banner tone={billing === "readonly" ? "danger" : "warn"}>{t(`billing.${billing}`)}</Banner>
          </div>
        )}
        <OfflineBar />

        <main className={clsx("mx-auto w-full flex-1 px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-8", wide(path) ? "max-w-6xl" : "max-w-3xl")}>{children}</main>
        <BottomNav />
      </div>
    </div>
  )
}
