"use client"

/**
 * Someone's sign-in details, shown once to whoever created them: the property's code, their email and a
 * first password. The server keeps only the password's hash, so this is the one chance to hand it over.
 */
import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { useI18n } from "@/i18n"
import { Banner, Button, KV } from "./ui"

export function Credentials({ code, email, password }: { code: string; email: string; password?: string | null }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  if (!password) return <Banner tone="info">{t("credentials.existing")}</Banner>

  const text = `${t("login.propertyCode")}: ${code}\n${t("login.email")}: ${email}\n${t("login.password")}: ${password}`
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* no clipboard (plain http): the details are on screen to write down */ }
  }

  return (
    <div className="space-y-3">
      <Banner tone="warn">{t("credentials.once")}</Banner>
      <dl className="rounded-xl bg-surface-2 px-3 py-1">
        <KV label={t("login.propertyCode")} value={<span className="font-mono text-base font-bold tracking-wider">{code}</span>} />
        <KV label={t("login.email")} value={email} />
        <KV label={t("login.password")} value={<span className="font-mono text-base font-bold select-all">{password}</span>} />
      </dl>
      <p className="text-sm text-ink-soft">{t("credentials.changeAfter")}</p>
      <Button variant="secondary" className="w-full" onClick={() => void copy()}>
        {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} {copied ? t("channels.copied") : t("channels.copy")}
      </Button>
    </div>
  )
}
