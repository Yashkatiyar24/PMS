"use client"

/**
 * Two ways in: a one-time code by SMS (what the desk uses, because nobody remembers a password) or email
 * and password (for the owner on a laptop). The server answers the same way whether or not the number is
 * registered, so this page cannot be used to find out who works here.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, KeyRound, Smartphone } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { useI18n } from "@/i18n"
import { Banner, Button, Field, Segmented } from "@/components/ui"

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
    <div className="flex min-h-dvh flex-col justify-center py-8">
      <div className="mb-6 flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-brand text-white shadow-md">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" />
            </svg>
          </span>
          <div>
            <h1 className="text-2xl font-bold leading-tight tracking-tight">{t("app.name")}</h1>
            <p className="text-sm text-ink-soft">{t("login.tagline")}</p>
          </div>
        </div>
        {/* The shell's menu is not on this screen, so the language switch lives here too. */}
        <button
          onClick={() => setLanguage(language === "hi" ? "en" : "hi")}
          aria-label={t("common.language")}
          className="shrink-0 rounded-full border border-line-strong bg-surface px-3 text-sm font-semibold text-ink-soft"
        >
          {language === "hi" ? "EN" : "हिं"}
        </button>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
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
    </div>
  )
}
