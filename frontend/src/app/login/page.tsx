"use client"

/**
 * Two ways in: a one-time code by SMS (what the desk uses, because nobody remembers a password) or email
 * and password (for the owner on a laptop). The server answers the same way whether or not the number is
 * registered, so this page cannot be used to find out who works here.
 */
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, KeyRound, Smartphone } from "lucide-react"
import { clsx } from "clsx"
import { api, ApiError } from "@/lib/api"
import { useI18n } from "@/i18n"
import { Banner, Button, Field, Logo, Segmented } from "@/components/ui"
import { Landing } from "./Landing"

export default function LoginPage() {
  const { t, language, setLanguage } = useI18n()
  const router = useRouter()
  const [mode, setMode] = useState<"phone" | "email">("phone")
  const [step, setStep] = useState<"target" | "code">("target")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // The window's scroll position is the external system the header follows.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
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

  const sendCode = () =>
    run(async () => {
      await api("/api/auth/otp/send", { method: "POST", body: { target: phone } })
      setNotice(t("login.codeSent"))
      setStep("code")
    })

  const verify = () =>
    run(async () => {
      await api("/api/auth/otp/verify", { method: "POST", body: { target: phone, code, deviceName: navigator.userAgent.slice(0, 60) } })
      router.push("/")
    })

  const signIn = () =>
    run(async () => {
      await api("/api/auth/login", { method: "POST", body: { email, password, deviceName: navigator.userAgent.slice(0, 60) } })
      router.push("/")
    })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === "email") return void signIn()
    return step === "target" ? void sendCode() : void verify()
  }

  return (
    <div className="overflow-x-clip">
      {/* Sits on the sky at the top of the page and frosts over once the page scrolls under it. */}
      <header className={clsx("sticky top-0 z-30 h-16 transition-colors md:h-20", scrolled && "bg-surface/80 shadow-[var(--shadow-card)] backdrop-blur-md")}>
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-3 px-4 md:px-8">
          <span className="flex min-w-0 items-center gap-2.5">
            <Logo />
            <span className="truncate text-[15px] font-extrabold tracking-tight">{t("app.name")}</span>
          </span>
          <nav className="hidden items-center gap-1 text-sm font-semibold md:flex">
            <a href="#features" className="inline-flex min-h-[44px] items-center rounded-full px-4 hover:bg-ink/5">{t("landing.nav.features")}</a>
            <a href="#how" className="inline-flex min-h-[44px] items-center rounded-full px-4 hover:bg-ink/5">{t("landing.nav.how")}</a>
            <a href="#pricing" className="inline-flex min-h-[44px] items-center rounded-full px-4 hover:bg-ink/5">{t("landing.nav.pricing")}</a>
          </nav>
          {/* The shell's menu is not on this screen, so the language switch lives here too. */}
          <button
            onClick={() => setLanguage(language === "hi" ? "en" : "hi")}
            aria-label={t("common.language")}
            className="shrink-0 rounded-full bg-ink px-5 text-sm font-semibold text-bg transition-colors hover:bg-ink/85"
          >
            {language === "hi" ? "EN" : "हिं"}
          </button>
        </div>
      </header>

      {/* Pulled up under the header so the sky starts at the very top. */}
      <div className="sky relative -mt-16 flex min-h-dvh flex-col overflow-hidden pt-16 md:-mt-20 md:pt-20">
        <section className="depth mx-auto w-full max-w-4xl px-4 pt-10 text-center md:pt-20" style={{ "--depth": "-8vh" } as React.CSSProperties}>
          <h1 className="display rise text-balance text-[40px] sm:text-6xl md:text-7xl">{t("login.headline")}</h1>
          <p className="rise mx-auto mt-4 max-w-xl text-balance text-base font-medium [animation-delay:120ms] sm:text-lg md:text-xl">
            {t("login.lead")} <span className="text-ink-soft">{t("login.rest")}</span>
          </p>
        </section>

        {/* Where the reference puts its one button, the desk gets the whole sign-in: it is here every morning. */}
        <form id="signin" onSubmit={submit} className="relative z-10 mx-4 scroll-mt-24 mt-8 space-y-4 rounded-3xl border border-surface/60 bg-surface/80 p-5 shadow-[var(--shadow-pop)] backdrop-blur-md sm:mx-auto sm:w-full sm:max-w-sm">
          <Segmented
            value={mode}
            onChange={(m) => { setMode(m); setStep("target"); setError(""); setNotice("") }}
            items={[
              { value: "phone", label: <span className="inline-flex items-center gap-1.5"><Smartphone size={15} aria-hidden /> {t("login.usePhone")}</span> },
              { value: "email", label: <span className="inline-flex items-center gap-1.5"><KeyRound size={15} aria-hidden /> {t("login.email")}</span> },
            ]}
          />

          {error && <Banner tone="danger">{error}</Banner>}
          {notice && !error && <Banner tone="info">{notice}</Banner>}

          {mode === "phone" && step === "target" && (
            <>
              <Field label={t("login.phone")}>
                <input inputMode="numeric" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" autoFocus />
              </Field>
              <Button type="submit" size="lg" className="w-full" disabled={busy || phone.replace(/\D/g, "").length < 10}>
                {t("login.sendCode")} <ArrowRight size={18} aria-hidden />
              </Button>
            </>
          )}

          {mode === "phone" && step === "code" && (
            <>
              <Field label={t("login.code")} hint={phone}>
                <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus className="text-center text-2xl font-bold tracking-[.4em]" />
              </Field>
              <Button type="submit" size="lg" className="w-full" disabled={busy || code.length < 4}>
                {t("login.verify")}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setStep("target")}>
                {t("action.back")}
              </Button>
            </>
          )}

          {mode === "email" && (
            <>
              <Field label={t("login.email")}>
                <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              </Field>
              <Field label={t("login.password")}>
                <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <Button type="submit" size="lg" className="w-full" disabled={busy || !email || !password}>
                {t("login.signIn")} <ArrowRight size={18} aria-hidden />
              </Button>
            </>
          )}
        </form>

        {/* Two layers so the entrance and the scroll sink each own a transform. */}
        <div aria-hidden className="emerge pointer-events-none mx-auto mt-auto w-full max-w-4xl px-2 pt-10">
          <div className="depth" style={{ "--depth": "14vh" } as React.CSSProperties}>
            <Dharamshala />
          </div>
        </div>
        <div aria-hidden className="clouds pointer-events-none absolute inset-x-0 bottom-0 h-28 md:h-44" />
      </div>

      <Landing />
    </div>
  )
}

/** Arched window: straight sides, a round head. */
const arch = (x: number, y: number, w: number, h: number) => `M${x} ${y + h}V${y + w / 2}a${w / 2} ${w / 2} 0 0 1 ${w} 0V${y + h}Z`

// Warm rooms on the left, sky caught in the glass on the right, as in the reference.
const COLS = [138, 180, 222, 264, 508, 550, 592, 634]
const FLOORS = [
  { y: 170, h: 52, lit: "10110010" },
  { y: 252, h: 58, lit: "11100100" },
]
const BUSHES = [[292, 138], [508, 138], [216, 140], [584, 140]]

/** A sandstone dharamshala with chhatris on the roof, drawn rather than photographed so it costs no download. */
function Dharamshala() {
  const stop = (offset: number, color: string) => <stop offset={offset} style={{ stopColor: `var(${color})` }} />
  return (
    <svg viewBox="0 0 800 340" className="block w-full" style={{ maskImage: "linear-gradient(#000 70%, transparent)" }}>
      <defs>
        <linearGradient id="dh-glow" x1="0" y1="0" x2="0" y2="1">{stop(0, "--glow-hi")}{stop(1, "--glow")}</linearGradient>
        <linearGradient id="dh-glass" x1="0" y1="0" x2="1" y2="1">{stop(0, "--glass-hi")}{stop(1, "--glass")}</linearGradient>
      </defs>

      {/* Wings, parapet and corner chhatris */}
      <rect className="dh-stone" x="110" y="150" width="580" height="175" />
      {Array.from({ length: 29 }, (_, i) => <rect key={i} className="dh-stone" x={112 + i * 20} y="138" width="12" height="12" />)}
      {[150, 650].map((cx) => (
        <g key={cx}>
          <rect className="dh-trim" x={cx - 1.5} y="75" width="3" height="11" />
          <path className="dh-stone" d={`M${cx - 24} 108c0-30 48-30 48 0z`} />
          <rect className="dh-trim" x={cx - 28} y="106" width="56" height="6" />
          <rect className="dh-stone" x={cx - 22} y="112" width="5" height="26" />
          <rect className="dh-stone" x={cx + 17} y="112" width="5" height="26" />
        </g>
      ))}

      {/* Gate tower with a lamp-lit pavilion on top */}
      <rect className="dh-stone" x="320" y="88" width="160" height="237" />
      {Array.from({ length: 8 }, (_, i) => <rect key={i} className="dh-stone" x={322 + i * 20} y="76" width="12" height="12" />)}
      <rect className="dh-trim" x="398.5" y="4" width="3" height="14" />
      <path className="dh-stone" d="M362 46c0-40 76-40 76 0z" />
      <rect className="dh-trim" x="356" y="46" width="88" height="7" />
      <rect x="370" y="53" width="60" height="23" fill="url(#dh-glow)" />
      <rect className="dh-stone" x="364" y="53" width="6" height="23" />
      <rect className="dh-stone" x="430" y="53" width="6" height="23" />

      {/* Cornices and the floor band */}
      <rect className="dh-trim" x="104" y="150" width="592" height="8" />
      <rect className="dh-trim" x="312" y="88" width="176" height="8" />
      <rect className="dh-trim" x="110" y="236" width="580" height="6" />

      {/* Jharokha balcony and the gate */}
      <path d={arch(372, 112, 56, 86)} fill="url(#dh-glow)" />
      <rect className="dh-trim" x="398" y="140" width="4" height="58" />
      <rect className="dh-trim" x="362" y="198" width="76" height="7" />
      <path className="dh-trim" d="M368 205h10l-5 10zM422 205h10l-5 10z" />
      <path className="dh-trim" d={arch(358, 250, 84, 75)} />
      <path d={arch(366, 258, 68, 67)} fill="url(#dh-glow)" />

      {FLOORS.flatMap(({ y, h, lit }) =>
        COLS.map((x, i) => (
          <g key={`${x}-${y}`}>
            <path d={arch(x, y, 28, h)} fill={lit[i] === "1" ? "url(#dh-glow)" : "url(#dh-glass)"} />
            <rect className="dh-trim" x={x + 13} y={y + 14} width="2" height={h - 14} />
            <rect className="dh-trim" x={x - 3} y={y + h} width="34" height="4" />
          </g>
        )),
      )}

      {/* Terrace plants */}
      {BUSHES.map(([cx, cy]) => (
        <g key={cx}>
          <circle className="dh-leaf-2" cx={cx - 10} cy={cy} r="12" />
          <circle className="dh-leaf" cx={cx} cy={cy - 6} r="14" />
          <circle className="dh-leaf-2" cx={cx + 12} cy={cy} r="10" />
        </g>
      ))}

      {/* Plinth and steps */}
      <rect className="dh-trim" x="70" y="325" width="660" height="15" />
      <rect className="dh-stone" x="350" y="325" width="100" height="6" />
      <rect className="dh-stone" x="342" y="331" width="116" height="9" />
    </svg>
  )
}
