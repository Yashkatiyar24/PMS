"use client"

/**
 * Two ways in: a one-time code by SMS (what the desk uses, because nobody remembers a password) or email
 * and password (for the owner on a laptop). The server answers the same way whether or not the number is
 * registered, so this page cannot be used to find out who works here.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { api, ApiError } from "@/lib/api"
import { useI18n } from "@/i18n"
import { Banner, Button, Card, Field } from "@/components/ui"

export default function LoginPage() {
  const { t } = useI18n()
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

  return (
    <div className="pt-10">
      <h1 className="mb-1 text-2xl font-bold">{t("app.name")}</h1>
      <p className="mb-6 text-[var(--color-ink-soft)]">{t("login.title")}</p>

      <Card className="space-y-4">
        {error && <Banner tone="danger">{error}</Banner>}
        {notice && !error && <Banner tone="info">{notice}</Banner>}

        {mode === "phone" && step === "target" && (
          <>
            <Field label={t("login.phone")}>
              <input inputMode="numeric" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" />
            </Field>
            <Button className="w-full" disabled={busy || phone.replace(/\D/g, "").length < 10} onClick={sendCode}>
              {t("login.sendCode")}
            </Button>
          </>
        )}

        {mode === "phone" && step === "code" && (
          <>
            <Field label={t("login.code")}>
              <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <Button className="w-full" disabled={busy || code.length < 4} onClick={verify}>
              {t("login.verify")}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setStep("target")}>
              {t("action.back")}
            </Button>
          </>
        )}

        {mode === "email" && (
          <>
            <Field label={t("login.email")}>
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label={t("login.password")}>
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button className="w-full" disabled={busy || !email || !password} onClick={signIn}>
              {t("login.signIn")}
            </Button>
          </>
        )}

        <Button variant="ghost" className="w-full" onClick={() => { setMode(mode === "phone" ? "email" : "phone"); setError(""); setNotice("") }}>
          {mode === "phone" ? t("login.useEmail") : t("login.usePhone")}
        </Button>
      </Card>
    </div>
  )
}
