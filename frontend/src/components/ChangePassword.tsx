"use client"

/**
 * Replace the first password someone was handed with their own. The current one is asked for, so a phone left
 * signed in cannot lock its owner out. When `required`, the server refuses everything else until this is done,
 * so the sheet cannot be closed and the app reloads once the new password is saved.
 */
import { useState } from "react"
import { api, ApiError } from "@/lib/api"
import { useI18n } from "@/i18n"
import { Banner, Button, Field, Sheet } from "./ui"

export function ChangePassword({ open, onOpenChange, required = false }: { open: boolean; onOpenChange: (open: boolean) => void; required?: boolean }) {
  const { t } = useI18n()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const close = (o: boolean) => {
    if (required) { if (!o && done) window.location.reload(); return }
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
    <Sheet open={open} onOpenChange={close} title={t(required ? "account.mustChangeTitle" : "account.changePassword")}
      description={required && !done ? t("account.mustChange") : undefined}
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
