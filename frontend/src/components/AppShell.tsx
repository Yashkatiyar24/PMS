"use client"

/**
 * The frame every screen sits in: property name, language and text-size controls, the offline bar and the
 * bottom navigation. The login screen gets none of it.
 */
import { usePathname } from "next/navigation"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { BottomNav } from "./BottomNav"
import { OfflineBar } from "./OfflineBar"
import { Loading } from "./ui"

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const { user, loading } = useSession()
  const { t, language, setLanguage, textSize, setTextSize } = useI18n()

  // The guest self-registration form is opened by someone with no account: no property name to show, no
  // navigation they could use, and nothing to switch languages between — it carries both itself.
  if (path.startsWith("/g/")) return <>{children}</>

  if (path.startsWith("/login")) return <main className="mx-auto max-w-md p-4">{children}</main>

  if (loading) return <Loading />

  const property = user?.memberships.find((m) => m.propertyId === user.propertyId)

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 no-print">
        <div className="min-w-0">
          <p className="truncate font-semibold">{property?.propertyName ?? t("app.name")}</p>
          {user && <p className="truncate text-xs text-[var(--color-ink-soft)]">{user.name}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setTextSize(textSize === "normal" ? "large" : "normal")}
            aria-label={t("common.textSize")}
            className="rounded-lg border border-[var(--color-line)] px-2 text-sm font-bold"
          >
            A{textSize === "large" ? "-" : "+"}
          </button>
          <button
            onClick={() => setLanguage(language === "hi" ? "en" : "hi")}
            aria-label={t("common.language")}
            className="rounded-lg border border-[var(--color-line)] px-2 text-sm font-semibold"
          >
            {language === "hi" ? "EN" : "हिं"}
          </button>
        </div>
      </header>

      <OfflineBar />

      <main className="flex-1 px-4 pb-24 pt-3">{children}</main>

      <BottomNav />
    </div>
  )
}
