"use client"

/** The handful of pieces every screen is built from. Sized for a thumb, legible in daylight. */
import { clsx } from "clsx"
import { useI18n } from "@/i18n"
import { rupees } from "@/lib/format"

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const styles = {
    primary: "bg-[var(--color-brand)] text-white",
    secondary: "bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line)]",
    danger: "bg-[var(--color-danger)] text-white",
    ghost: "bg-transparent text-[var(--color-brand)]",
  }[variant]
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold",
        "disabled:opacity-50 disabled:pointer-events-none active:translate-y-px",
        styles,
        className,
      )}
    />
  )
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-[var(--color-ink-soft)]">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-[var(--color-ink-soft)]">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-[var(--color-danger)]">{error}</span>}
    </label>
  )
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={clsx("rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4", className)} />
}

/** Status never relies on colour alone: every chip carries a word too (PRD accessibility). */
export function Chip({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "danger" | "info"; children: React.ReactNode }) {
  const styles = {
    neutral: "bg-[var(--color-bg)] text-[var(--color-ink-soft)] border-[var(--color-line)]",
    ok: "bg-[var(--color-ok-soft)] text-[var(--color-ok)] border-[var(--color-ok)]",
    warn: "bg-[var(--color-warn-soft)] text-[var(--color-warn)] border-[var(--color-warn)]",
    danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]",
    info: "bg-[var(--color-info-soft)] text-[var(--color-info)] border-[var(--color-info)]",
  }[tone]
  return <span className={clsx("inline-block rounded-full border px-2 py-0.5 text-xs font-semibold", styles)}>{children}</span>
}

export function Banner({ tone = "info", children }: { tone?: "info" | "warn" | "danger"; children: React.ReactNode }) {
  const styles = {
    info: "bg-[var(--color-info-soft)] text-[var(--color-info)]",
    warn: "bg-[var(--color-warn-soft)] text-[var(--color-warn)]",
    danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  }[tone]
  return <div className={clsx("rounded-xl px-3 py-2 text-sm font-medium", styles)}>{children}</div>
}

export function Loading() {
  const { t } = useI18n()
  return <p className="p-4 text-[var(--color-ink-soft)]">{t("common.loading")}</p>
}

export function Empty({ children }: { children?: React.ReactNode }) {
  const { t } = useI18n()
  return <p className="rounded-xl border border-dashed border-[var(--color-line)] p-4 text-center text-sm text-[var(--color-ink-soft)]">{children ?? t("today.empty")}</p>
}

export function Money({ paise, className }: { paise: number; className?: string }) {
  return <span className={clsx("tabular-nums", className)}>{rupees(paise)}</span>
}
