"use client"

/**
 * Our back office, not the property's. Only a super-admin can open it, and the server enforces that; this
 * screen shows counts and billing state rather than anything about a guest, because guest data belongs to
 * the property and support may see it only inside a window the owner opens.
 */
import { useState } from "react"
import { Building2, CreditCard, Plus } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { formatDateTime, rupees } from "@/lib/format"
import { useResource } from "@/lib/use-resource"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { Avatar, Banner, Button, Chip, ChoiceChips, Empty, Field, KV, ListCard, ListRow, Loading, PageHeader, Sheet, type Tone } from "@/components/ui"

type PropertyHealth = {
  propertyId: string
  propertyName: string
  city: string
  orgId: string
  orgName: string
  plan: string
  billingStatus: string
  active: boolean
  rooms: number
  bookingsLast30Days: number
  lastActivityAt: string | null
  openFolios: number
  outstandingPaise: number
  outboxPending: number
  supportAccess: boolean
}

const BILLING_TONE: Record<string, Tone> = { active: "ok", trial: "brand", overdue: "warn", readonly: "danger", closed: "neutral" }
const STATUSES = ["trial", "active", "overdue", "readonly", "closed"]
const PLANS = ["basic", "standard", "large"]
const EMPTY_FORM = { orgName: "", propertyName: "", city: "", state: "", phone: "", ownerName: "", ownerPhone: "", planCode: "basic" }

export default function AdminPage() {
  const { t } = useI18n()
  const { user, loading } = useSession()
  const { data: properties, reload } = useResource(() => api<PropertyHealth[]>("/api/admin/properties"), [], t("error.generic"))

  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  if (loading) return <Loading />
  if (!user?.superAdmin) return <Empty>{t("error.generic")}</Empty>

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError("")
    try {
      await action()
      reload()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
    } finally {
      setBusy(false)
    }
  }

  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }) })
  const open = properties?.find((p) => p.propertyId === openId) ?? null

  return (
    <div className="space-y-4">
      <PageHeader title={t("admin.title")} back="/settings" subtitle={properties ? `${properties.length}` : undefined}
        actions={<Button size="sm" onClick={() => { setAdding(true); setAdded("") }}><Plus size={16} aria-hidden /> {t("admin.onboard")}</Button>} />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}
      {added && <Banner tone="ok" onClose={() => setAdded("")}>{added}</Banner>}

      {!properties ? (
        <Loading />
      ) : properties.length === 0 ? (
        <Empty icon={Building2} />
      ) : (
        <ListCard>
          {properties.map((p) => (
            <ListRow
              key={p.propertyId}
              onClick={() => setOpenId(p.propertyId)}
              leading={<Avatar name={p.propertyName} tone={p.active ? BILLING_TONE[p.billingStatus] ?? "neutral" : "neutral"} icon={Building2} />}
              title={p.propertyName}
              subtitle={`${p.orgName}${p.city ? ` · ${p.city}` : ""} · ${p.rooms} ${t("admin.roomsCount").toLowerCase()}`}
              right={
                <span className="flex flex-col items-end gap-1">
                  <Chip tone={BILLING_TONE[p.billingStatus] ?? "neutral"} dot>{p.billingStatus}</Chip>
                  {p.outboxPending > 0 && <Chip tone="warn">{t("admin.outbox")} {p.outboxPending}</Chip>}
                </span>
              }
              chevron
            />
          ))}
        </ListCard>
      )}

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)} title={open?.propertyName ?? ""} description={open ? `${open.orgName} · ${open.plan}` : undefined}>
        {open && (
          <div className="space-y-4">
            <dl className="rounded-xl bg-surface-2 px-3 py-1">
              <KV label={t("admin.roomsCount")} value={open.rooms} />
              <KV label={t("admin.recentBookings")} value={open.bookingsLast30Days} />
              <KV label={t("reports.outstanding")} value={rupees(open.outstandingPaise)} tone={open.outstandingPaise > 0 ? "danger" : undefined} />
              <KV label={t("admin.lastActivity")} value={open.lastActivityAt ? formatDateTime(open.lastActivityAt) : t("admin.never")} />
            </dl>
            <div className="flex flex-wrap gap-1.5">
              {open.supportAccess && <Chip tone="info" dot>{t("admin.supportAccess")}</Chip>}
              {!open.active && <Chip tone="danger" dot>inactive</Chip>}
            </div>
            <Field label={t("admin.plan")}>
              <ChoiceChips disabled={busy} value={open.plan} options={PLANS.map((p) => ({ value: p, label: p }))}
                onChange={(planCode) => run(async () => { await api(`/api/admin/organisations/${open.orgId}/plan`, { method: "PATCH", body: { planCode } }) })} />
            </Field>
            <Field label="Billing">
              <ChoiceChips disabled={busy} value={open.billingStatus} options={STATUSES.map((s) => ({ value: s, label: s }))}
                onChange={(billingStatus) => run(async () => { await api(`/api/admin/organisations/${open.orgId}/billing`, { method: "PATCH", body: { billingStatus } }) })} />
            </Field>
          </div>
        )}
      </Sheet>

      <Sheet open={adding} onOpenChange={setAdding} title={t("admin.onboard")} wide
        footer={
          <Button size="lg" className="w-full"
            disabled={busy || !form.orgName.trim() || !form.propertyName.trim() || !form.ownerName.trim() || form.ownerPhone.replace(/\D/g, "").length < 10}
            onClick={() => run(async () => { await api("/api/admin/properties", { method: "POST", body: { ...form, ownerEmail: null } }); setAdding(false); setAdded(t("admin.onboarded")); setForm(EMPTY_FORM) })}>
            <CreditCard size={18} aria-hidden /> {t("action.save")}
          </Button>
        }>
        <div className="space-y-3">
          <Field label={t("admin.trust")}><input {...field("orgName")} autoFocus /></Field>
          <Field label={t("setup.name")}><input {...field("propertyName")} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("setup.city")}><input {...field("city")} /></Field>
            <Field label={t("setup.state")}><input {...field("state")} /></Field>
          </div>
          <Field label={t("setup.phone")}><input inputMode="tel" {...field("phone")} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("admin.ownerName")}><input {...field("ownerName")} /></Field>
            <Field label={t("admin.ownerPhone")}><input inputMode="numeric" {...field("ownerPhone")} placeholder="9876543210" /></Field>
          </div>
          <Field label={t("admin.plan")}><ChoiceChips value={form.planCode} onChange={(planCode) => setForm({ ...form, planCode })} options={PLANS.map((p) => ({ value: p, label: p }))} /></Field>
        </div>
      </Sheet>
    </div>
  )
}
