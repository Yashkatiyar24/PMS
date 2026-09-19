"use client"

/**
 * One guest: who they are, the stay they are in now, every stay before, what they paid and what they owe.
 * Photographs and identity documents are shown only to the desk, only through a link that expires in minutes,
 * and every look is written to the audit log.
 */
import { use, useRef, useState } from "react"
import { BedDouble, Camera, Eye, IdCard, IndianRupee, Pencil, Wallet } from "lucide-react"
import { api, ApiError, upload } from "@/lib/api"
import { compressImage } from "@/lib/image"
import { useResource } from "@/lib/use-resource"
import { formatDate, formatDateTime, rupees } from "@/lib/format"
import type { BookingState, GuestProfile } from "@/lib/types"
import { useI18n } from "@/i18n"
import { useSession } from "@/lib/session"
import { Avatar, Banner, Button, Card, Chip, Empty, Field, ListCard, ListRow, Loading, PageHeader, SectionLabel, Sheet, StatTile, type Tone } from "@/components/ui"

const STATE_TONE: Record<BookingState, Tone> = { pending: "warn", reserved: "brand", checked_in: "ok", checked_out: "neutral", no_show: "danger", cancelled: "neutral" }
const ID_TYPES = ["aadhaar", "voter", "dl", "passport", "other"] as const

type Form = { name: string; phone: string; email: string; address: string; city: string; state: string; country: string; nationality: string; idType: string; idLast4: string; passportNo: string; visaNo: string; notes: string }

export default function GuestProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t } = useI18n()
  const { has } = useSession()
  const { data, error: loadError, reload } = useResource(() => api<GuestProfile>(`/api/guests/${id}/profile`), [id], t("error.generic"))
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const photoInput = useRef<HTMLInputElement>(null)

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

  /** Opens a signed link that expires in minutes; the server records the look. */
  const view = (path: string) => run(async () => { const { url } = await api<{ url: string }>(path); window.open(url, "_blank") })

  if (!data) return loadError ? <Banner tone="danger">{loadError}</Banner> : <Loading />
  const g = data.guest

  const save = () =>
    run(async () => {
      if (!form) return
      await api(`/api/guests/${id}`, {
        method: "PUT",
        body: { ...form, idType: form.idType || null, idLast4: form.idLast4 || null, passportNo: form.passportNo || null, visaNo: form.visaNo || null, visaExpiry: g.visaExpiry },
      })
      setForm(null)
    })

  const rows: [string, string | null | undefined][] = [
    [t("login.phone"), g.phone],
    [t("setup.email"), g.email],
    [t("checkin.address"), g.address],
    [t("checkin.city"), g.city],
    [t("setup.state"), g.state],
    [t("guests.country"), g.country],
    [t("checkin.nationality"), g.nationality],
    [t("checkin.idType"), g.idType ? `${g.idType}${g.idLast4 ? ` •••• ${g.idLast4}` : ""}` : null],
    [t("guests.passport"), g.passportNo],
    [t("guests.notes"), g.notes],
  ]

  return (
    <div className="space-y-4">
      <PageHeader title={g.name} subtitle={g.phone || undefined} back="/guests"
        actions={has("reservations.edit") ? (
          <Button size="sm" variant="secondary" onClick={() => setForm({
            name: g.name, phone: g.phone, email: g.email ?? "", address: g.address, city: g.city, state: g.state, country: g.country, nationality: g.nationality,
            idType: g.idType ?? "", idLast4: g.idLast4 ?? "", passportNo: g.passportNo ?? "", visaNo: g.visaNo ?? "", notes: g.notes,
          })}><Pencil size={16} aria-hidden /> {t("guests.edit")}</Button>
        ) : undefined} />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label={t("guests.visits")} value={data.visits} tone="brand" icon={BedDouble} />
        <StatTile label={t("res.nights")} value={data.nights} tone="teal" icon={BedDouble} />
        <StatTile label={t("guests.spent")} value={rupees(data.spentPaise)} tone="ok" icon={Wallet} />
        <StatTile label={t("reports.outstanding")} value={rupees(data.outstandingPaise)} tone={data.outstandingPaise > 0 ? "danger" : "ok"} icon={IndianRupee} />
      </div>

      {data.current && (
        <>
          <SectionLabel>{t("guests.current")}</SectionLabel>
          <ListCard>
            <ListRow href={`/stays/${data.current.bookingId}`} leading={<Avatar icon={BedDouble} tone="ok" size={38} />}
              title={data.current.units ?? "—"} subtitle={`${formatDate(data.current.arriveAt)} → ${formatDate(data.current.departAt)}`}
              right={data.current.balancePaise > 0 ? <Chip tone="danger">{rupees(data.current.balancePaise)}</Chip> : <Chip tone="ok">{t("payment.paid")}</Chip>} />
          </ListCard>
        </>
      )}

      <Card title={t("common.details")} action={has("checkin") ? (
        <span className="flex gap-1.5">
          {g.hasPhoto && <Button size="sm" variant="secondary" disabled={busy} onClick={() => view(`/api/guests/${id}/photo-url`)}><Eye size={15} aria-hidden /> {t("guests.photo")}</Button>}
          {g.hasIdPhoto && <Button size="sm" variant="secondary" disabled={busy} onClick={() => view(`/api/guests/${id}/id-photo-url`)}><IdCard size={15} aria-hidden /> {t("guests.idDocument")}</Button>}
          <Button size="sm" variant="soft" disabled={busy} onClick={() => photoInput.current?.click()}><Camera size={15} aria-hidden /> {t("guests.takePhoto")}</Button>
        </span>
      ) : undefined}>
        <input ref={photoInput} type="file" accept="image/*" capture="user" hidden
          onChange={(e) => { const file = e.target.files?.[0]; if (file) void run(async () => { await upload(`/api/guests/${id}/photo`, await compressImage(file, 300), "photo.jpg") }) }} />
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="border-b border-line pb-2">
              <dt className="text-xs font-semibold text-ink-soft">{k}</dt>
              <dd className="font-medium">{v || "—"}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <SectionLabel>{t("guests.stays")}</SectionLabel>
      {data.stays.length === 0 ? <Empty /> : (
        <ListCard>
          {data.stays.map((s) => (
            <ListRow key={s.bookingId} href={`/stays/${s.bookingId}`} title={`${formatDate(s.arriveAt)} → ${formatDate(s.departAt)}`}
              subtitle={[s.units, rupees(s.totalPaise)].filter(Boolean).join(" · ")}
              right={<Chip tone={STATE_TONE[s.state]} dot>{t(`state.${s.state}` as "state.reserved")}</Chip>} />
          ))}
        </ListCard>
      )}

      <SectionLabel>{t("stay.payments")}</SectionLabel>
      {data.payments.length === 0 ? <Empty /> : (
        <ListCard>
          {data.payments.map((p, i) => (
            <ListRow key={i} href={`/stays/${p.bookingId}`} title={rupees(p.amountPaise)} subtitle={formatDateTime(p.receivedAt)}
              right={<Chip tone={p.refund ? "warn" : "ok"}>{p.refund ? t("stay.refund") : p.mode.toUpperCase()}</Chip>} />
          ))}
        </ListCard>
      )}

      <Sheet wide open={!!form} onOpenChange={(o) => !o && setForm(null)} title={t("guests.edit")}
        footer={<Button size="lg" className="w-full" disabled={busy || !form?.name.trim()} onClick={save}>{t("action.save")}</Button>}>
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("checkin.name")}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label={t("login.phone")}><input inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label={t("setup.email")}><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label={t("checkin.address")}><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label={t("checkin.city")}><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label={t("setup.state")}><input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></Field>
            <Field label={t("guests.country")}><input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></Field>
            <Field label={t("checkin.nationality")} hint={t("guests.nationalityHint")}><input value={form.nationality} maxLength={2} onChange={(e) => setForm({ ...form, nationality: e.target.value.toUpperCase() })} /></Field>
            <Field label={t("checkin.idType")}>
              <select value={form.idType} onChange={(e) => setForm({ ...form, idType: e.target.value })}>
                <option value="">—</option>
                {ID_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
            <Field label={t("checkin.idLast4")} hint={t("checkin.idLast4Hint")}><input value={form.idLast4} maxLength={4} onChange={(e) => setForm({ ...form, idLast4: e.target.value })} /></Field>
            <Field label={t("guests.passport")}><input value={form.passportNo} onChange={(e) => setForm({ ...form, passportNo: e.target.value })} /></Field>
            <Field label={t("guests.visa")}><input value={form.visaNo} onChange={(e) => setForm({ ...form, visaNo: e.target.value })} /></Field>
            <Field label={t("guests.notes")} className="sm:col-span-2"><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
        )}
      </Sheet>
    </div>
  )
}
