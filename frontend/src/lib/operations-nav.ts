"use client"

/**
 * The day-to-day screens that have no tab of their own (guests have one), each shown only to the roles that do that work and
 * only when the property has taken that module. One list, used by the Settings screen on a phone and by the
 * laptop rail, so the two never disagree about what exists.
 */
import { Boxes, PackageSearch, ReceiptIndianRupee, ScrollText, UtensilsCrossed, Wrench } from "lucide-react"
import type { Tone } from "@/components/ui"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"

export type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>
  tone: Tone
}

export function useOperations(): NavItem[] {
  const { t } = useI18n()
  const { has } = useSession()
  return [
    { href: "/maintenance", label: t("maint.title"), icon: Wrench, tone: "warn" as const, show: has("maintenance") || has("maintenance.report") },
    { href: "/lost-found", label: t("lost.title"), icon: PackageSearch, tone: "teal" as const, show: has("lost_found") },
    { href: "/restaurant", label: t("pos.title"), icon: UtensilsCrossed, tone: "ok" as const, show: has("restaurant") },
    { href: "/inventory", label: t("stock.title"), icon: Boxes, tone: "teal" as const, show: has("inventory") },
    { href: "/expenses", label: t("expense.title"), icon: ReceiptIndianRupee, tone: "warn" as const, show: has("expenses") },
    { href: "/audit", label: t("audit.title"), icon: ScrollText, tone: "violet" as const, show: has("audit.view") },
  ].filter((item) => item.show)
}
