"use client"

/** Replace the first password someone was handed with their own. The current one is asked for, so a phone left signed in cannot lock its owner out. */
import { useState } from "react"
import { api, ApiError } from "@/lib/api"
import { useI18n } from "@/i18n"
import { Banner, Button, Field, Sheet } from "./ui"

export function ChangePassword({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const close = (o: boolean) => {
    onOpenChange(o)
    if (!o) { setCurrent(""); setNext(""); setError(""); setDone(false) }
  }

  async function save() {
    setBusy(true)
    setError("")
    try {
      await api("/api/users/me/password", { method: "POST", body: { currentPassword: current, password: next } })
      setDone(true)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={close} title={t("account.changePassword")}
      footer={done
        ? <Button size="lg" className="w-full" onClick={() => close(false)}>{t("action.done")}</Button>
        : <Button size="lg" className="w-full" disabled={busy || !current || next.length < 8} onClick={() => void save()}>{t("action.save")}</Button>}>
      {done ? (
        <Banner tone="ok">{t("account.passwordChanged")}</Banner>
      ) : (
        <div className="space-y-3">
          {error && <Banner tone="danger">{error}</Banner>}
          <Field label={t("account.currentPassword")}>
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
          </Field>
          <Field label={t("account.newPassword")} hint={t("account.newPasswordHint")}>
            <input type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
        </div>
      )}
    </Sheet>
  )
}
