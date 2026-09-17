"use client"

/**
 * Our back office, not the property's. Only a super-admin can open it, and the server enforces that; this
 * screen shows counts and billing state rather than anything about a guest, because guest data belongs to
 * the property and support may see it only inside a window the owner opens.
 */
import { useState } from "react"
import { Building2, Plus } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { formatDateTime, rupees } from "@/lib/format"
import { useResource } from "@/lib/use-resource"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { Banner, Button, Card, Chip, Empty, Field, Loading } from "@/components/ui"

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

const BILLING_TONE: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  active: "ok",
  trial: "neutral",
  overdue: "warn",
  readonly: "danger",
  closed: "danger",
}

export default function AdminPage() {
  const { t } = useI18n()
  const { user, loading } = useSession()
  const { data: properties, reload } = useResource(
    () => api<PropertyHealth[]>("/api/admin/properties"),
    [],
    t("error.generic"),
  )

  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState("")
  const [form, setForm] = useState({ orgName: "", propertyName: "", city: "", state: "", phone: "", ownerName: "", ownerPhone: "", planCode: "basic" })

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

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }),
  })

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("admin.title")}</h1>
      {error && <Banner tone="danger">{error}</Banner>}
      {added && <Banner tone="info">{added}</Banner>}

      {adding ? (
        <Card className="space-y-3">
          <h2 className="font-semibold">{t("admin.onboard")}</h2>
          <Field label={t("admin.trust")}>
            <input {...field("orgName")} />
          </Field>
          <Field label={t("setup.name")}>
            <input {...field("propertyName")} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("setup.city")}>
              <input {...field("city")} />
            </Field>
            <Field label={t("setup.state")}>
              <input {...field("state")} />
            </Field>
          </div>
          <Field label={t("setup.phone")}>
            <input inputMode="tel" {...field("phone")} />
          </Field>
          <Field label={t("admin.ownerName")}>
            <input {...field("ownerName")} />
          </Field>
          <Field label={t("admin.ownerPhone")}>
            <input inputMode="numeric" {...field("ownerPhone")} placeholder="9876543210" />
          </Field>
          <Field label={t("admin.plan")}>
            <select value={form.planCode} onChange={(e) => setForm({ ...form, planCode: e.target.value })}>
              <option value="basic">basic</option>
              <option value="standard">standard</option>
              <option value="large">large</option>
            </select>
          </Field>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={busy || !form.orgName.trim() || !form.propertyName.trim() || !form.ownerName.trim() || form.ownerPhone.replace(/\D/g, "").length < 10}
              onClick={() =>
                run(async () => {
                  await api("/api/admin/properties", { method: "POST", body: { ...form, ownerEmail: null } })
                  setAdding(false)
                  setAdded(t("admin.onboarded"))
                  setForm({ orgName: "", propertyName: "", city: "", state: "", phone: "", ownerName: "", ownerPhone: "", planCode: "basic" })
                })
              }
            >
              {t("action.save")}
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => setAdding(false)}>
              {t("action.cancel")}
            </Button>
          </div>
        </Card>
      ) : (
        <Button className="w-full" onClick={() => { setAdding(true); setAdded("") }}>
          <Plus size={18} aria-hidden /> {t("admin.onboard")}
        </Button>
      )}

      {!properties ? (
        <Loading />
      ) : properties.length === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-2">
          {properties.map((property) => (
            <li key={property.propertyId}>
              <Card className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 truncate font-semibold">
                      <Building2 size={16} aria-hidden /> {property.propertyName}
                    </p>
                    <p className="truncate text-sm text-[var(--color-ink-soft)]">
                      {property.orgName}
                      {property.city && ` · ${property.city}`}
                    </p>
                  </div>
                  <Chip tone={BILLING_TONE[property.billingStatus] ?? "neutral"}>{property.billingStatus}</Chip>
                </div>

                <dl className="grid grid-cols-2 gap-1 text-sm">
                  <Stat label={t("admin.roomsCount")} value={String(property.rooms)} />
                  <Stat label={t("admin.recentBookings")} value={String(property.bookingsLast30Days)} />
                  <Stat label={t("reports.outstanding")} value={rupees(property.outstandingPaise)} />
                  <Stat
                    label={t("admin.lastActivity")}
                    value={property.lastActivityAt ? formatDateTime(property.lastActivityAt) : t("admin.never")}
                  />
                </dl>

                <div className="flex flex-wrap items-center gap-2">
                  {property.outboxPending > 0 && (
                    <Chip tone="warn">
                      {t("admin.outbox")}: {property.outboxPending}
                    </Chip>
                  )}
                  {property.supportAccess && <Chip tone="info">{t("admin.supportAccess")}</Chip>}
                  {!property.active && <Chip tone="danger">inactive</Chip>}
                </div>

                <div className="flex items-center gap-2">
                  <select
                    className="max-w-40"
                    value={property.billingStatus}
                    disabled={busy}
                    onChange={(e) =>
                      run(async () => {
                        await api(`/api/admin/organisations/${property.orgId}/billing`, {
                          method: "PATCH",
                          body: { billingStatus: e.target.value },
                        })
                      })
                    }
                  >
                    {["trial", "active", "overdue", "readonly", "closed"].map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <select
                    className="max-w-32"
                    value={property.plan}
                    disabled={busy}
                    onChange={(e) =>
                      run(async () => {
                        await api(`/api/admin/organisations/${property.orgId}/plan`, {
                          method: "PATCH",
                          body: { planCode: e.target.value },
                        })
                      })
                    }
                  >
                    {["basic", "standard", "large"].map((plan) => (
                      <option key={plan} value={plan}>
                        {plan}
                      </option>
                    ))}
                  </select>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--color-ink-soft)]">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
