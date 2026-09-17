"use client"

/**
 * Housekeeping (PRD H1, H2). Rooms grouped by floor; one tap flips clean and dirty, because that is what
 * the cleaner does twenty times a day. Blocking asks for a reason, since it takes a room out of sale.
 */
import { useState } from "react"
import { api, ApiError } from "@/lib/api"
import { useResource } from "@/lib/use-resource"
import type { Room } from "@/lib/types"
import { useI18n } from "@/i18n"
import { Banner, Button, Card, Chip, Field, Loading } from "@/components/ui"

export default function RoomsPage() {
  const { t } = useI18n()
  const { data: rooms, error: loadError, reload, set } = useResource(() => api<Room[]>("/api/rooms"), [], t("error.generic"))
  const [blocking, setBlocking] = useState<Room | null>(null)
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")

  async function setStatus(room: Room, status: string, why?: string) {
    // Optimistic: the desk sees the change instantly, and a failure puts it straight back.
    set((current) => current.map((r) => (r.id === room.id ? { ...r, status: status as Room["status"] } : r)))
    try {
      await api(`/api/rooms/${room.id}/status`, { method: "PATCH", body: { status, reason: why ?? null, until: null } })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
      reload()
    }
  }

  if (!rooms) return loadError ? <Banner tone="danger">{loadError}</Banner> : <Loading />

  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("nav.rooms")}</h1>
      {error && <Banner tone="danger">{error}</Banner>}

      {blocking && (
        <Card className="space-y-2">
          <h2 className="font-semibold">
            {t("rooms.status.blocked")}: {blocking.number}
          </h2>
          <Field label={t("rooms.blockReason")}>
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={!reason.trim()}
              onClick={async () => { await setStatus(blocking, "blocked", reason); setBlocking(null); setReason("") }}
            >
              {t("action.save")}
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => { setBlocking(null); setReason("") }}>
              {t("action.cancel")}
            </Button>
          </div>
        </Card>
      )}

      {floors.map((floor) => (
        <section key={floor}>
          <h2 className="mb-2 font-semibold">{t("rooms.floor", { n: floor })}</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {rooms.filter((r) => r.floor === floor).map((room) => (
              <li key={room.id}>
                <Card className="space-y-2 p-3">
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-lg font-bold">{room.number}</span>
                    <span className="truncate text-xs text-[var(--color-ink-soft)]">{room.roomTypeName}</span>
                  </div>
                  <Chip tone={room.status === "clean" ? "ok" : room.status === "dirty" ? "warn" : "danger"}>
                    {t(`rooms.status.${room.status}` as "rooms.status.clean")}
                  </Chip>
                  <div className="flex gap-1">
                    {room.status !== "blocked" ? (
                      <>
                        <Button
                          variant="secondary"
                          className="flex-1 px-2 py-2 text-xs"
                          onClick={() => setStatus(room, room.status === "clean" ? "dirty" : "clean")}
                        >
                          {room.status === "clean" ? t("rooms.status.dirty") : t("rooms.status.clean")}
                        </Button>
                        <Button variant="ghost" className="px-2 py-2 text-xs" onClick={() => setBlocking(room)}>
                          ✕
                        </Button>
                      </>
                    ) : (
                      <Button variant="secondary" className="flex-1 px-2 py-2 text-xs" onClick={() => setStatus(room, "clean")}>
                        {t("rooms.status.clean")}
                      </Button>
                    )}
                  </div>
                  {room.blockedReason && <p className="text-xs text-[var(--color-ink-soft)]">{room.blockedReason}</p>}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
