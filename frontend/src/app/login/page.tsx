"use client"

/**
 * One way in: the property's code, the person's email and a password (no SMS is needed). A wrong code, email or
 * password all get the same answer, so this page cannot be used to find out who works where.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { clsx } from "clsx"
import { api, ApiError } from "@/lib/api"
import { useI18n } from "@/i18n"
import { Banner, Button, Field, Sheet, Wordmark } from "@/components/ui"
import { Landing } from "./Landing"

/** The desk signs in on the same phone every morning, so the code is remembered on the device. */
const CODE_KEY = "pms.propertyCode"
/** The photograph is light in both themes, so whatever sits on it keeps the light theme's ink and button colours. */
const ON_PHOTO = {
  "--color-ink": "#171c26", "--color-ink-soft": "#596273", "--color-bg": "#f7f8fa", "--color-on-solid": "#ffffff",
  "--sky-top": "#9dc0e6", "--sky": "#d3e3f4", "--cloud": "#ffffff",
} as React.CSSProperties
const noSubscribe = () => () => {}
function readSavedCode() {
  try { return localStorage.getItem(CODE_KEY) ?? "" } catch { return "" }
}

export default function LoginPage() {
  const { t, language, setLanguage } = useI18n()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  // The form lives behind the Sign In button, as on the reference page. A visit bounced here from a signed-in
  // screen (?signin=1) starts with it open, since that person came to sign in, not to read; closing it sticks.
  const wantsSignIn = useSyncExternalStore(noSubscribe, () => new URLSearchParams(window.location.search).has("signin"), () => false)
  const [opened, setOpened] = useState<boolean | null>(null)
  const open = opened ?? wantsSignIn
  const setOpen = (o: boolean) => setOpened(o)

  // The remembered code, or nothing on the server and in a private window. Typing replaces it.
  const saved = useSyncExternalStore(noSubscribe, readSavedCode, () => "")
  const [typed, setCode] = useState<string | null>(null)
  const code = typed ?? saved

  // The window's scroll position is the external system the header follows, and the photograph rides it: as the
  // page scrolls down the building climbs faster than the page, and it settles back on the way up. Written
  // straight to the element once per frame rather than through state, so it never re-renders the page.
  const photo = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let frame = 0
    const onScroll = () => {
      setScrolled(window.scrollY > 8)
      if (still) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const img = photo.current
        if (!img?.parentElement) return
        // Never lift the photograph's bottom edge above the hero's own: that would open a gap under it.
        const room = img.offsetTop + img.offsetHeight - img.parentElement.clientHeight
        img.style.transform = `translate3d(0, ${-Math.min(window.scrollY * 0.35, Math.max(room, 0))}px, 0)`
      })
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame) }
  }, [])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError("")
    try {
      await action()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await api("/api/auth/login", { method: "POST", body: { code, email, password, deviceName: navigator.userAgent.slice(0, 60) } })
      if (code.trim()) try { localStorage.setItem(CODE_KEY, code.replace(/[^a-z0-9]/gi, "").toUpperCase()) } catch { /* not remembered */ }
      router.push("/")
    })
  }

  // The platform admin has no property code and leaves it empty; everyone at a property types theirs.
  const codeLength = code.replace(/[^a-z0-9]/gi, "").length
  const ready = (codeLength >= 4 || codeLength === 0) && email.includes("@") && !!password

  return (
    <div className="overflow-x-clip">
      {/* Sits on the sky at the top of the page and frosts over once the page scrolls under it. */}
      <header className={clsx("sticky top-0 z-30 h-16 text-ink transition-colors md:h-20", scrolled && "bg-surface/80 shadow-[var(--shadow-card)] backdrop-blur-md")} style={scrolled ? undefined : ON_PHOTO}>
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-3 px-4 md:px-8">
          <span className="flex min-w-0 items-center">
            <Wordmark label={t("app.name")} className="h-[18px] md:h-5" />
          </span>
          <nav className="hidden items-center gap-1 text-sm font-semibold md:flex">
            <a href="#features" className="inline-flex min-h-[44px] items-center rounded-full px-4 hover:bg-ink/5">{t("landing.nav.features")}</a>
            <a href="#how" className="inline-flex min-h-[44px] items-center rounded-full px-4 hover:bg-ink/5">{t("landing.nav.how")}</a>
            <a href="#pricing" className="inline-flex min-h-[44px] items-center rounded-full px-4 hover:bg-ink/5">{t("landing.nav.pricing")}</a>
          </nav>
          <span className="flex shrink-0 items-center gap-1">
            {/* The shell's menu is not on this screen, so the language switch lives here too. */}
            <button
              onClick={() => setLanguage(language === "hi" ? "en" : "hi")}
              aria-label={t("common.language")}
              className="inline-flex min-h-[40px] items-center rounded-full px-3 text-sm font-semibold transition-colors hover:bg-ink/5"
            >
              {language === "hi" ? "EN" : "हिं"}
            </button>
            <Button size="sm" onClick={() => setOpen(true)} className="min-h-[40px] px-5">{t("login.signIn")}</Button>
          </span>
        </div>
      </header>

      {/* Pulled up under the header so the photograph starts at the very top. */}
      <div className="sky relative isolate -mt-16 flex min-h-dvh flex-col overflow-hidden pt-16 text-ink md:-mt-20 md:pt-20" style={ON_PHOTO}>
        {/* The photograph starts a third of the way down, its sky fading into the CSS sky above, so the headline and
            the button sit in open sky and the building rises under them. A plain <img>: one static file. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={photo} src="/hero.jpg" alt="" aria-hidden className="pointer-events-none absolute inset-x-0 top-[34%] -z-10 h-full w-full object-cover object-top will-change-transform [mask-image:linear-gradient(to_bottom,transparent,#000_22%)]" />
        <section className="depth relative mx-auto w-full max-w-5xl px-4 pt-12 text-center md:pt-20" style={{ "--depth": "-8vh" } as React.CSSProperties}>
          <div className="relative inline-block max-w-full">
            <h1 className="display rise text-balance text-[44px] sm:text-6xl md:text-7xl">{t("login.headline")}</h1>
            {/* Two puffs of the same sky drift over the ends of the headline, as on the reference page. */}
            <span aria-hidden className="pointer-events-none absolute -left-8 top-[30%] h-16 w-32 rounded-full bg-[radial-gradient(closest-side,var(--cloud)_45%,transparent)] opacity-60 md:-left-24 md:top-[8%] md:h-40 md:w-80 md:opacity-95" />
            <span aria-hidden className="pointer-events-none absolute -right-8 top-[10%] h-16 w-32 rounded-full bg-[radial-gradient(closest-side,var(--cloud)_45%,transparent)] opacity-60 md:-right-28 md:top-[-6%] md:h-44 md:w-96 md:opacity-95" />
          </div>
          <p className="rise mx-auto mt-5 max-w-2xl text-balance text-lg font-medium [animation-delay:120ms] md:text-2xl">
            {t("login.lead")} <span className="text-ink-soft">{t("login.rest")}</span>
          </p>
          <div className="rise mt-8 [animation-delay:200ms]">
            <Button size="lg" onClick={() => setOpen(true)} className="px-7">
              {t("login.signIn")} <ArrowRight size={18} aria-hidden />
            </Button>
          </div>
        </section>

      </div>

      {/* The desk is here every morning: the code is remembered on the device, so it is two fields and a tap. */}
      <Sheet open={open} onOpenChange={setOpen} hero title={t("login.title")} description={t("login.dialogLead")}>
        <form id="signin" onSubmit={submit} className="line-form space-y-7 pt-7">
          {error && <Banner tone="danger">{error}</Banner>}

          {/* Two to a row on a laptop, stacked on a phone; the password always has the row to itself. */}
          <div className="grid gap-6 sm:grid-cols-2 sm:gap-x-10">
            <Field label={t("login.propertyCode")} hint={t("login.codeHint")}>
              <input autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="organization" value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SRD4821" className="tracking-wider" autoFocus />
            </Field>
            <Field label={t("login.email")}>
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.in" />
            </Field>
            <Field label={t("login.password")} className="sm:col-span-2">
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </Field>
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={busy || !ready}>
            {t("login.signIn")} <ArrowRight size={18} aria-hidden />
          </Button>
        </form>
      </Sheet>

      <Landing onSignIn={() => setOpen(true)} />
    </div>
  )
}
