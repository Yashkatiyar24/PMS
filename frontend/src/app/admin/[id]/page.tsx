"use client"

/**
 * One property as the platform sees it: how it is doing, who runs it, what it pays for and what changed
 * lately, plus the three things support actually does: switch it off or on, give a locked-out person a new
 * password, and keep notes. Counts and the names the owner gave us, nothing about any guest; opening this
 * page is itself written to the property's audit log, so the owner can see when we looked.
 */
import { use, useState } from "react"
import { BedDouble, CalendarDays, IndianRupee, KeyRound, MessageSquare, Users } from "lucide-react"
import { clsx } from "clsx"
import { api, ApiError, upload } from "@/lib/api"
import { formatDate, formatDateTime, rupees } from "@/lib/format"
import { useResource } from "@/lib/use-resource"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { Avatar, Banner, Button, Card, Chip, ChoiceChips, Empty, Field, KV, Loading, PageHeader, Sheet, StatTile } from "@/components/ui"
import { PropertyPhoto } from "@/components/PropertyPhoto"
import { Credentials } from "@/components/Credentials"
import { BILLING_TONE, isQuiet, MODULES, QUIET_DAYS, STATUSES, type Member, type Plan, type PropertyHealth } from "../shared"

type Activity = { at: string; table_name: string; action: string; who: string }
type NewPassword = { name: string; phone: string; password: string }

export default function AdminPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t } = useI18n()
  const { user, loading } = useSession()
  /** A translation when there is one, else a readable fallback: the audit log names tables the language files may not. */
  const label = (key: string, fallback: string) => { const v = t(key as Parameters<typeof t>[0]); return v === key ? fallback : v }
  const { data, error: loadError, reload } = useResource(
    async () => {
      const [property, team, activity, plans] = await Promise.all([
        api<PropertyHealth>(`/api/admin/properties/${id}`),
        api<Member[]>(`/api/admin/properties/${id}/team`),
        api<Activity[]>(`/api/admin/properties/${id}/activity`),
        api<Plan[]>("/api/admin/plans"),
      ])
      return { property, team, activity, plans }
    },
    [id],
    t("error.generic"),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  // Notes are typed freely and saved when the box loses focus; null means "as loaded".
  const [notes, setNotes] = useState<string | null>(null)
  const [notesSaved, setNotesSaved] = useState(false)
  const [fresh, setFresh] = useState<NewPassword | null>(null)

  if (loading) return <Loading />
  if (!user?.superAdmin) return <Empty>{t("error.generic")}</Empty>
  if (!data) return loadError ? <Banner tone="danger">{loadError}</Banner> : <Loading />

  const { property: p, team, activity, plans } = data
  const status = (s: string) => label(`admin.status.${s}`, s)
  const plan = plans.find((x) => x.code === p.plan)
  const shownNotes = notes ?? p.notes ?? ""

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

  const saveNotes = () => {
    if (shownNotes.trim() === (p.notes ?? "").trim()) return
    void run(async () => {
      await api(`/api/admin/properties/${p.propertyId}/notes`, { method: "PATCH", body: { notes: shownNotes } })
      setNotes(null)
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
    })
  }

  const resetPassword = (m: Member) => {
    if (!window.confirm(t("admin.resetConfirm", { name: m.name }))) return
    void run(async () => { setFresh(await api<NewPassword>(`/api/admin/properties/${p.propertyId}/team/${m.userId}/password`, { method: "POST" })) })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={p.propertyName}
        subtitle={<><span className="font-mono">{p.code}</span> · {p.orgName}{p.city && ` · ${p.city}`}</>}
        back="/admin"
        actions={
          <span className="flex flex-wrap items-center justify-end gap-1">
            {isQuiet(p) && <Chip tone="neutral" title={t("admin.quietHint", { n: QUIET_DAYS })}>{t("admin.quiet")}</Chip>}
            <Chip tone={p.active ? BILLING_TONE[p.billingStatus] ?? "neutral" : "neutral"} dot>{p.active ? status(p.billingStatus) : t("admin.inactiveShort")}</Chip>
          </span>
        }
      />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}
      {!p.active && <Banner tone="warn">{t("admin.inactive")}</Banner>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label={t("admin.roomsCount")} value={p.rooms} icon={BedDouble} tone="teal" hint={plan && t("admin.maxRooms", { n: plan.maxRooms })} />
        <StatTile label={t("admin.team")} value={p.users} icon={Users} tone="brand" />
        <StatTile label={t("today.inHouse")} value={p.stayingNow} icon={Users} tone="violet" />
        <StatTile label={t("admin.recentBookings")} value={p.bookingsLast30Days} icon={CalendarDays} tone="ok" />
        <StatTile label={t("reports.outstanding")} value={rupees(p.outstandingPaise)} icon={IndianRupee} tone={p.outstandingPaise > 0 ? "danger" : "ok"} hint={t("admin.openBillsCount", { n: p.openFolios })} />
        <StatTile label={t("admin.outbox")} value={p.outboxPending} icon={MessageSquare} tone={p.outboxPending > 0 ? "warn" : "neutral"} />
      </div>

      {/* min-w-0 on the columns: a long unbroken line in a card (an audit entry) must truncate, not widen the page. */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0 space-y-4">
          <PropertyPhoto
            url={p.photoUrl}
            busy={busy}
            onUpload={(photo) => run(async () => { await upload(`/api/admin/properties/${p.propertyId}/photo`, photo, "photo.jpg") })}
            onRemove={() => run(async () => { await api(`/api/admin/properties/${p.propertyId}/photo`, { method: "DELETE" }) })}
          />
          <Card title={t("admin.details")}>
            <dl className="divide-y divide-line">
              <KV label={t("login.propertyCode")} value={<span className="font-mono font-bold tracking-wider">{p.code}</span>} />
              <KV label={t("admin.trust")} value={p.orgName} />
              <KV label={t("admin.owner")} value={p.ownerName ? `${p.ownerName}${p.ownerPhone ? ` · ${p.ownerPhone}` : ""}` : "—"} />
              <KV label={t("setup.phone")} value={p.phone || "—"} />
              <KV label={t("setup.city")} value={[p.city, p.state].filter(Boolean).join(", ") || "—"} />
              <KV label={t("admin.created")} value={formatDate(p.createdAt)} />
              <KV label={t("admin.lastActivity")} value={p.lastActivityAt ? formatDateTime(p.lastActivityAt) : t("admin.never")} />
              <KV label={t("admin.supportAccess")} value={<Chip tone={p.supportAccess ? "info" : "neutral"} dot>{p.supportAccess ? t("common.yes") : t("common.no")}</Chip>} />
            </dl>
          </Card>

          <Card title={`${t("admin.team")} · ${team.length}`}>
            {team.length === 0 ? (
              <Empty icon={Users} />
            ) : (
              <ul className="divide-y divide-line">
                {team.map((m) => (
                  <li key={m.userId} className="flex items-center gap-3 py-2.5">
                    <Avatar name={m.name} size={36} tone={m.active ? "brand" : "neutral"} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{m.name}</span>
                      {m.phone && <span className="block text-xs text-ink-soft">{m.phone}</span>}
                    </span>
                    <Chip tone={m.active ? "brand" : "neutral"}>{label(`role.${m.role}`, m.role)}</Chip>
                    {m.active && (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => resetPassword(m)} aria-label={`${t("admin.resetPassword")}: ${m.name}`} title={t("admin.resetPassword")}>
                        <KeyRound size={16} aria-hidden />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card title={t("admin.planBilling")}>
            <div className="space-y-4">
              <Field group label={t("admin.plan")} hint={plan ? t("admin.planHint", { rooms: plan.maxRooms, price: rupees(plan.monthlyPaise) }) : undefined}>
                <ChoiceChips disabled={busy} value={p.plan} options={plans.map((x) => ({ value: x.code, label: x.name }))}
                  onChange={(planCode) => run(async () => { await api(`/api/admin/organisations/${p.orgId}/plan`, { method: "PATCH", body: { planCode } }) })} />
              </Field>
              <Field group label={t("admin.billing")} hint={t("admin.billingHint")}>
                <ChoiceChips disabled={busy} value={p.billingStatus} options={STATUSES.map((s) => ({ value: s, label: status(s) }))}
                  onChange={(billingStatus) => run(async () => { await api(`/api/admin/organisations/${p.orgId}/billing`, { method: "PATCH", body: { billingStatus } }) })} />
              </Field>
              <div>
                <span className="mb-1.5 block text-[13px] font-semibold text-ink-soft">{t("admin.active")}</span>
                <button type="button" role="switch" aria-checked={p.active} disabled={busy} aria-label={t("admin.active")}
                  onClick={() => run(async () => { await api(`/api/admin/properties/${p.propertyId}/active`, { method: "PATCH", body: { active: !p.active } }) })}
                  className="inline-flex items-center gap-3 disabled:opacity-45">
                  <span className={clsx("relative inline-block h-7 w-12 shrink-0 rounded-full transition-colors", p.active ? "bg-brand" : "bg-line-strong")}>
                    <span className={clsx("absolute left-0 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform", p.active ? "translate-x-[22px]" : "translate-x-0.5")} />
                  </span>
                  <span className="text-sm font-medium">{p.active ? t("common.yes") : t("common.no")}</span>
                </button>
                <span className="mt-1 block text-xs text-ink-faint">{t("admin.activeHint")}</span>
              </div>
            </div>
          </Card>

          <Card title={t("admin.modules")}>
            <p className="mb-3 text-sm text-ink-soft">{t("admin.modulesHint")}</p>
            <ChoiceChips disabled={busy} value={p.modules} options={MODULES.map((m) => ({ value: m.value, label: t(m.label) }))}
              onChange={(m) => run(async () => {
                const modules = p.modules.includes(m) ? p.modules.filter((x) => x !== m) : [...p.modules, m]
                await api(`/api/admin/properties/${p.propertyId}/modules`, { method: "PATCH", body: { modules } })
              })} />
          </Card>

          <Card title={t("admin.notes")} action={notesSaved ? <Chip tone="ok">{t("settings.savedAt")}</Chip> : undefined}>
            <textarea rows={4} value={shownNotes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} disabled={busy} aria-label={t("admin.notes")} />
            <p className="mt-1.5 text-xs text-ink-faint">{t("admin.notesHint")}</p>
          </Card>

          <Card title={t("admin.activity")}>
            {activity.length === 0 ? (
              <Empty />
            ) : (
              <ul className="scroll-thin max-h-96 divide-y divide-line overflow-y-auto">
                {activity.map((a, i) => (
                  <li key={i} className="py-2">
                    <p className="truncate text-sm font-semibold">{label(`activity.${a.table_name}.${a.action}`, a.action.replace(/_/g, " "))} · {label(`audit.table.${a.table_name}`, a.table_name)}</p>
                    <p className="text-xs text-ink-soft">{formatDateTime(a.at)} · {a.who}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* Shown once, like the credentials at onboarding: the password is never stored in the clear. */}
      <Sheet open={!!fresh} onOpenChange={(o) => !o && setFresh(null)} title={fresh ? t("admin.resetDone", { name: fresh.name }) : ""} description={t("credentials.title")}>
        {fresh && <Credentials code={p.code} phone={fresh.phone} password={fresh.password} />}
      </Sheet>
    </div>
  )
}
