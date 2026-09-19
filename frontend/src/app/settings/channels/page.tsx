"use client"

/**
 * Selling online, the owner's side: the property's booking page, and one calendar link per room and OTA.
 *
 * iCal is the connection every OTA offers without a partner contract. It swaps busy dates in both
 * directions every 15 minutes: our address goes into the OTA, the OTA's address comes in here. A stay the
 * OTA sells on a room already taken here is shown as a double booking to sort out, never squeezed in.
 */
import { useState } from "react"
import Link from "next/link"
import { AlertTriangle, CalendarSync, Copy, ExternalLink, KeyRound, Link2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react"
import { api, API_BASE, ApiError } from "@/lib/api"
import { useResource } from "@/lib/use-resource"
import { formatDate, formatDateTime } from "@/lib/format"
import { useI18n } from "@/i18n"
import { Avatar, Banner, Button, Card, Chip, ChoiceChips, Empty, Field, ListCard, ListRow, Loading, Menu, PageHeader, SectionLabel, Sheet } from "@/components/ui"

type ChannelLink = { id: string; roomId: string; roomNumber: string; channel: string; exportToken: string; importUrl: string | null; lastSyncedAt: string | null; lastError: string | null; conflicts: number }
type Conflict = { id: string; channel: string; roomNumber: string; arriveOn: string; departOn: string; summary: string; conflict: string }
type Overview = { bookingSlug: string | null; onlineBookingEnabled: boolean; links: ChannelLink[]; conflicts: Conflict[]; rooms: { id: string; number: string; typeName: string }[] }

// Brand names are not translated; "other" is.
const OTAS = ["airbnb", "booking_com", "makemytrip", "agoda", "expedia", "other"] as const
const BRAND: Record<string, string> = { airbnb: "Airbnb", booking_com: "Booking.com", makemytrip: "MakeMyTrip", agoda: "Agoda", expedia: "Expedia" }

const exportUrl = (token: string) => `${API_BASE}/api/public/calendar/${token}.ics`

export default function ChannelsPage() {
  const { t } = useI18n()
  const { data, error: loadError, reload, set } = useResource(() => api<Overview>("/api/channels"), [], t("error.generic"))
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ChannelLink | null>(null)
  const [confirming, setConfirming] = useState<{ title: string; body: string; action: string; run: () => Promise<void> } | null>(null)
  const [copied, setCopied] = useState("")
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")

  const otaName = (channel: string) => BRAND[channel] ?? t("channels.other")

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key)
    setError("")
    try {
      await action()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
    } finally {
      setBusy("")
    }
  }

  const replace = (link: ChannelLink) => set((o) => ({ ...o, links: o.links.map((l) => (l.id === link.id ? link : l)) }))

  async function copy(key: string, text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(""), 1500)
  }

  if (!data) return loadError ? <Banner tone="danger">{loadError}</Banner> : <Loading />
  const pageUrl = data.bookingSlug ? `${window.location.origin}/book/${data.bookingSlug}` : ""

  return (
    <div className="space-y-5">
      <PageHeader title={t("channels.title")} subtitle={t("channels.subtitle")} back="/settings" />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}

      {/* The property's own booking page */}
      <Card title={t("channels.page")}
        action={<Chip tone={data.onlineBookingEnabled ? "ok" : "warn"} dot>{data.onlineBookingEnabled ? t("channels.on") : t("channels.off")}</Chip>}>
        {pageUrl ? (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input readOnly value={pageUrl} aria-label={t("channels.page")} className="font-mono text-sm" onFocus={(e) => e.target.select()} />
              <div className="flex shrink-0 gap-2">
                <Button variant="secondary" onClick={() => copy("page", pageUrl)}><Copy size={16} aria-hidden /> {copied === "page" ? t("channels.copied") : t("channels.copy")}</Button>
                <a href={pageUrl} target="_blank" rel="noreferrer"><Button variant="secondary"><ExternalLink size={16} aria-hidden /> {t("channels.open")}</Button></a>
              </div>
            </div>
            <p className="text-sm text-ink-soft">
              {data.onlineBookingEnabled ? t("channels.pageOn") : <>{t("channels.pageOff")} <Link href="/settings" className="font-semibold text-brand-ink underline">{t("settings.title")}</Link></>}
            </p>
          </div>
        ) : (
          <Button disabled={busy === "page"} onClick={() => run("page", async () => { await api("/api/channels/booking-page", { method: "POST" }); reload() })}>
            <Link2 size={18} aria-hidden /> {t("channels.createPage")}
          </Button>
        )}
      </Card>

      {/* Double bookings come first: they are what needs doing today */}
      {data.conflicts.length > 0 && (
        <section className="space-y-2">
          <SectionLabel>{t("channels.conflicts")}</SectionLabel>
          <Banner tone="warn">{t("channels.conflictsHint")}</Banner>
          <ListCard>
            {data.conflicts.map((c) => (
              <ListRow
                key={c.id}
                leading={<Avatar tone="warn" icon={AlertTriangle} size={38} />}
                title={`${t("channels.room")} ${c.roomNumber} · ${otaName(c.channel)}`}
                subtitle={`${formatDate(c.arriveOn)} → ${formatDate(c.departOn)} · ${c.conflict}`}
              />
            ))}
          </ListCard>
        </section>
      )}

      {/* One calendar link per room and OTA */}
      <section className="space-y-2">
        <SectionLabel right={data.rooms.length > 0 && <Button size="sm" onClick={() => setAdding(true)}><Plus size={16} aria-hidden /> {t("channels.add")}</Button>}>
          {t("channels.calendars")}
        </SectionLabel>
        <p className="px-1 text-sm text-ink-soft">{t("channels.calendarsHint")}</p>
        {data.links.length === 0 ? (
          <Empty icon={CalendarSync}>{t("channels.none")}</Empty>
        ) : (
          <ListCard>
            {data.links.map((link) => (
              <ListRow
                key={link.id}
                leading={<Avatar name={otaName(link.channel)} tone={link.lastError ? "danger" : link.conflicts > 0 ? "warn" : "teal"} size={38} />}
                title={`${t("channels.room")} ${link.roomNumber} · ${otaName(link.channel)}`}
                subtitle={
                  link.lastError ? <span className="text-danger">{link.lastError}</span>
                    : !link.importUrl ? t("channels.exportOnly")
                    : link.lastSyncedAt ? t("channels.lastSync", { time: formatDateTime(link.lastSyncedAt) })
                    : t("channels.neverSynced")
                }
                right={
                  <span className="flex items-center gap-1">
                    <Button size="sm" variant="secondary" onClick={() => copy(link.id, exportUrl(link.exportToken))} title={t("channels.exportUrl")}>
                      <Copy size={14} aria-hidden /> <span className="hidden sm:inline">{copied === link.id ? t("channels.copied") : t("channels.copy")}</span>
                    </Button>
                    <Menu
                      items={[
                        ...(link.importUrl ? [{ label: t("channels.syncNow"), icon: RefreshCw, disabled: busy === link.id, onSelect: () => void run(link.id, async () => replace(await api<ChannelLink>(`/api/channels/links/${link.id}/sync`, { method: "POST" }))) }] : []),
                        { label: t("channels.editUrl"), icon: Pencil, onSelect: () => setEditing(link) },
                        { label: t("channels.rotate"), icon: KeyRound, onSelect: () => setConfirming({ title: t("channels.rotate"), body: t("channels.rotateConfirm"), action: t("channels.rotate"), run: async () => replace(await api<ChannelLink>(`/api/channels/links/${link.id}/rotate`, { method: "POST" })) }) },
                        { label: t("channels.remove"), icon: Trash2, danger: true, separator: true, onSelect: () => setConfirming({ title: t("channels.remove"), body: t("channels.removeConfirm", { room: link.roomNumber, ota: otaName(link.channel) }), action: t("channels.remove"), run: async () => { await api(`/api/channels/links/${link.id}`, { method: "DELETE" }); reload() } }) },
                      ]}
                    />
                  </span>
                }
              />
            ))}
          </ListCard>
        )}
        <p className="px-1 text-xs text-ink-faint">{t("channels.dormNote")}</p>
      </section>

      <LinkSheet
        open={adding || !!editing}
        link={editing}
        rooms={data.rooms}
        otaName={otaName}
        onClose={() => { setAdding(false); setEditing(null) }}
        onSaved={() => { setAdding(false); setEditing(null); reload() }}
      />

      <Sheet open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)} title={confirming?.title ?? ""} description={confirming?.body}
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setConfirming(null)}>{t("action.cancel")}</Button>
            <Button variant="danger" className="flex-1" disabled={!!busy} onClick={() => confirming && void run("confirm", async () => { await confirming.run(); setConfirming(null) })}>
              {confirming?.action}
            </Button>
          </>
        }
      >
        <span />
      </Sheet>
    </div>
  )
}

/** Link a room to an OTA, or change the OTA's calendar address on an existing link. */
function LinkSheet({ open, link, rooms, otaName, onClose, onSaved }: {
  open: boolean
  link: ChannelLink | null
  rooms: Overview["rooms"]
  otaName: (channel: string) => string
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useI18n()
  const [roomId, setRoomId] = useState("")
  const [channel, setChannel] = useState<string>("airbnb")
  const [importUrl, setImportUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [openedFor, setOpenedFor] = useState<string | null>(null)

  // Reset the form each time the sheet opens, for whichever link it opens on.
  const key = open ? link?.id ?? "new" : null
  if (key !== openedFor) {
    setOpenedFor(key)
    setRoomId(link?.roomId ?? rooms[0]?.id ?? "")
    setChannel(link?.channel ?? "airbnb")
    setImportUrl(link?.importUrl ?? "")
    setError("")
  }

  async function save() {
    setBusy(true)
    setError("")
    try {
      if (link) await api(`/api/channels/links/${link.id}`, { method: "PATCH", body: { importUrl } })
      else await api("/api/channels/links", { method: "POST", body: { roomId, channel, importUrl } })
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={link ? t("channels.editUrl") : t("channels.add")}
      description={link ? `${t("channels.room")} ${link.roomNumber} · ${otaName(link.channel)}` : undefined}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>{t("action.cancel")}</Button>
          <Button className="flex-1" disabled={busy || (!link && !roomId)} onClick={() => void save()}>{t("action.save")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Banner tone="danger">{error}</Banner>}
        {!link && (
          <>
            <Field label={t("channels.room")}>
              <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.number} · {r.typeName}</option>)}
              </select>
            </Field>
            <div>
              <span className="mb-1.5 block text-[13px] font-semibold text-ink-soft">{t("channels.ota")}</span>
              <ChoiceChips value={channel} onChange={setChannel} options={OTAS.map((o) => ({ value: o, label: otaName(o) }))} />
            </div>
          </>
        )}
        <Field label={t("channels.importUrl")} hint={t("channels.importHint")}>
          <input type="url" inputMode="url" placeholder="https://" value={importUrl} onChange={(e) => setImportUrl(e.target.value)} className="font-mono text-sm" />
        </Field>
      </div>
    </Sheet>
  )
}
