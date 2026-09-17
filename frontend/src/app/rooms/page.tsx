"use client"

/**
 * Housekeeping (PRD H1, H2). Rooms grouped by floor as a wall of tiles; one tap opens the room, one more
 * flips clean and dirty, because that is what the cleaner does twenty times a day. Blocking asks for a
 * reason, since it takes a room out of sale.
 */
import { useMemo, useState } from "react"
import { Ban, Check, Sparkles, Unlock } from "lucide-react"
import { clsx } from "clsx"
import { api, ApiError } from "@/lib/api"
import { useResource } from "@/lib/use-resource"
import type { Room } from "@/lib/types"
import { useI18n } from "@/i18n"
import { Banner, Button, Chip, Field, Loading, PageHeader, SectionLabel, Segmented, Sheet, TONE, type Tone } from "@/components/ui"

type Status = Room["status"]
const STATUS_TONE: Record<Status, Tone> = { clean: "ok", dirty: "warn", blocked: "danger" }

export default function RoomsPage() {
  const { t } = useI18n()
  const { data: rooms, error: loadError, reload, set } = useResource(() => api<Room[]>("/api/rooms"), [], t("error.generic"))
  const [filter, setFilter] = useState<"all" | Status>("all")
  const [openId, setOpenId] = useState<string | null>(null)
  const [blocking, setBlocking] = useState(false)
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")

  const counts = useMemo(() => {
    const c = { clean: 0, dirty: 0, blocked: 0 }
    for (const r of rooms ?? []) c[r.status]++
    return c
  }, [rooms])

  async function setStatus(room: Room, status: Status, why?: string) {
    // Optimistic: the desk sees the change instantly, and a failure puts it straight back.
    set((current) => current.map((r) => (r.id === room.id ? { ...r, status, blockedReason: why ?? null } : r)))
    try {
      await api(`/api/rooms/${room.id}/status`, { method: "PATCH", body: { status, reason: why ?? null, until: null } })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
      reload()
    }
  }

  if (!rooms) return loadError ? <Banner tone="danger">{loadError}</Banner> : <Loading />

  const open = rooms.find((r) => r.id === openId) ?? null
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b)
  const shown = filter === "all" ? rooms : rooms.filter((r) => r.status === filter)
  const label = (s: Status) => t(`rooms.status.${s}` as "rooms.status.clean")

  const close = () => { setOpenId(null); setBlocking(false); setReason("") }

  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.rooms")} subtitle={t("rooms.summary", counts)} />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}

      <Segmented
        value={filter}
        onChange={setFilter}
        items={[
          { value: "all", label: t("common.all"), count: rooms.length, tone: "brand" },
          { value: "clean", label: label("clean"), count: counts.clean, tone: "ok" },
          { value: "dirty", label: label("dirty"), count: counts.dirty, tone: "warn" },
          { value: "blocked", label: label("blocked"), count: counts.blocked, tone: "danger" },
        ]}
      />

      {floors.map((floor) => {
        const onFloor = shown.filter((r) => r.floor === floor)
        if (onFloor.length === 0) return null
        return (
          <section key={floor}>
            <SectionLabel>{t("rooms.floor", { n: floor })}</SectionLabel>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {onFloor.map((room) => {
                const tone = STATUS_TONE[room.status]
                return (
                  <li key={room.id}>
                    <button
                      onClick={() => setOpenId(room.id)}
                      aria-label={`${room.number} · ${label(room.status)}`}
                      className={clsx(
                        "relative flex w-full flex-col items-start gap-1 overflow-hidden rounded-2xl border border-line bg-surface p-3 text-left shadow-[var(--shadow-card)] transition-colors hover:bg-surface-2",
                      )}
                    >
                      <span aria-hidden className={clsx("absolute inset-y-0 left-0 w-1.5", TONE[tone].solid)} />
                      <span className="pl-1.5 text-xl font-bold leading-none tabular-nums">{room.number}</span>
                      <span className="w-full truncate pl-1.5 text-[11px] text-ink-soft">{room.roomTypeName}</span>
                      <Chip tone={tone} dot className="ml-1.5 mt-0.5">{label(room.status)}</Chip>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      <Sheet
        open={!!open}
        onOpenChange={(o) => !o && close()}
        title={open ? `${t("nav.rooms")} ${open.number}` : ""}
        description={open ? `${open.roomTypeName} · ${t("rooms.floor", { n: open.floor })}` : undefined}
      >
        {open && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2.5">
              <span className="text-sm text-ink-soft">{t("common.details")}</span>
              <Chip tone={STATUS_TONE[open.status]} dot>{label(open.status)}</Chip>
            </div>
            {open.blockedReason && <p className="text-sm text-ink-soft">{open.blockedReason}</p>}

            {!blocking ? (
              <div className="grid gap-2">
                {open.status !== "blocked" ? (
                  <>
                    {open.status === "dirty" ? (
                      <Button size="lg" onClick={() => { void setStatus(open, "clean"); close() }}>
                        <Sparkles size={20} aria-hidden /> {t("rooms.markClean")}
                      </Button>
                    ) : (
                      <Button size="lg" variant="soft" onClick={() => { void setStatus(open, "dirty"); close() }}>
                        <Check size={20} aria-hidden /> {t("rooms.markDirty")}
                      </Button>
                    )}
                    <Button variant="ghost" className="text-danger hover:bg-danger-soft" onClick={() => setBlocking(true)}>
                      <Ban size={18} aria-hidden /> {t("rooms.block")}
                    </Button>
                  </>
                ) : (
                  <Button size="lg" onClick={() => { void setStatus(open, "clean"); close() }}>
                    <Unlock size={20} aria-hidden /> {t("rooms.unblock")}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <Field label={t("rooms.blockReason")}>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
                </Field>
                <div className="flex gap-2">
                  <Button variant="danger" className="flex-1" disabled={!reason.trim()} onClick={() => { void setStatus(open, "blocked", reason); close() }}>
                    {t("rooms.block")}
                  </Button>
                  <Button variant="secondary" className="flex-1" onClick={() => { setBlocking(false); setReason("") }}>
                    {t("action.cancel")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}
