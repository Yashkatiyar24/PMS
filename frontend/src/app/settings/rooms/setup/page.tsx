"use client"

/**
 * Laying out a property's rooms.
 *
 * A property arrives with a floor plan already in it (three floors of 10, 10 and 5 — twenty-five rooms), so
 * this screen is not a gate anybody has to pass before taking a booking. It is here for the building that is
 * not shaped like that: forty rooms over four floors, or ten over one, or a fifth floor added next year.
 *
 * Two things it will not do. It never renumbers or removes a room that already exists — rooms carry bookings
 * and history, so a plan only ever adds. And it shows exactly what it is about to do before it does it: the
 * preview and the real thing are the same call to the same server method, one with `apply` off, so there is
 * nothing for them to disagree about.
 */
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Layers, Minus, Plus } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import type { Floor, RoomDefaults, RoomSetupPlan, RoomType } from "@/lib/types"
import { useI18n } from "@/i18n"
import { Banner, Button, Card, Chip, Field, Loading, PageHeader, SectionLabel } from "@/components/ui"

type Row = { floor: number; rooms: number; name: string }

export default function RoomSetupWizard() {
  const { t } = useI18n()
  const router = useRouter()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [types, setTypes] = useState<RoomType[]>([])
  const [typeId, setTypeId] = useState("")
  const [limits, setLimits] = useState<RoomDefaults | null>(null)
  const [plan, setPlan] = useState<RoomSetupPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(0)

  // Start from what the property has, or from the default plan when it has nothing yet.
  useEffect(() => {
    void (async () => {
      try {
        const [defaults, floors, roomTypes] = await Promise.all([
          api<RoomDefaults>("/api/rooms/defaults"),
          api<Floor[]>("/api/floors"),
          api<RoomType[]>("/api/room-types"),
        ])
        setLimits(defaults)
        setTypes(roomTypes)
        setTypeId(roomTypes.find((ty) => !ty.dormitory)?.id ?? roomTypes[0]?.id ?? "")
        const withRooms = floors.filter((f) => f.rooms > 0)
        setRows(withRooms.length > 0
          ? withRooms.map((f) => ({ floor: f.number, rooms: f.rooms, name: f.name }))
          : defaults.roomsPerFloor.map((rooms, i) => ({ floor: defaults.firstFloor + i, rooms, name: "" })))
      } catch (e) {
        setError(e instanceof ApiError ? e.message : t("error.generic"))
      }
    })()
  }, [t])

  const total = (rows ?? []).reduce((sum, r) => sum + r.rooms, 0)

  const send = useCallback(async (apply: boolean) => {
    if (!rows) return
    setBusy(true)
    setError("")
    try {
      const body = { floors: rows.map((r) => ({ floor: r.floor, rooms: r.rooms, name: r.name })), roomTypeId: typeId || null, apply }
      const result = await api<RoomSetupPlan>("/api/rooms/setup", { method: "POST", body })
      if (apply) setDone(result.created)
      else setPlan(result)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("error.generic"))
    } finally {
      setBusy(false)
    }
  }, [rows, typeId, t])

  if (!rows || !limits) return <Loading />

  const setRooms = (floor: number, rooms: number) =>
    setRows(rows.map((r) => (r.floor === floor ? { ...r, rooms: Math.max(0, Math.min(limits.maxRoomsPerFloor, rooms)) } : r)))

  if (done > 0) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("setup.roomsTitle")} back="/settings/rooms" />
        <Card className="space-y-3 text-center">
          <div className="anim-pop mx-auto grid h-16 w-16 place-items-center rounded-full bg-ok-soft">
            <Check size={32} className="text-ok" aria-hidden />
          </div>
          <p className="text-lg font-bold">{t("setup.roomsCreated", { count: String(done) })}</p>
          <Button className="w-full" onClick={() => router.push("/settings/rooms")}>{t("setup.openRooms")}</Button>
        </Card>
      </div>
    )
  }

  // Step 2: exactly what is about to happen, floor by floor, before anything is written.
  if (plan) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("setup.preview")} subtitle={t("setup.previewTotal", { total: String(plan.total) })} back="/settings/rooms" />
        {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}
        {plan.surplus > 0 && <Banner tone="warn">{t("setup.surplusWarning", { count: String(plan.surplus) })}</Banner>}

        {plan.floors.map((f) => (
          <Card key={f.floor} title={f.name || t("setup.floorN", { n: String(f.floor) })}
            action={<span className="text-xs text-ink-soft">{t("setup.nRooms", { n: String(f.create.length + f.keep.length) })}</span>}>
            <div className="flex flex-wrap gap-1.5">
              {f.keep.map((n) => <Chip key={n} tone="neutral" title={t("setup.alreadyThere")}>{n}</Chip>)}
              {f.create.map((n) => <Chip key={n} tone="ok" title={t("setup.willBeCreated")}>+ {n}</Chip>)}
            </div>
            {f.surplus.length > 0 && (
              <div className="mt-3">
                <SectionLabel>{t("setup.surplus")}</SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {f.surplus.map((n) => <Chip key={n} tone="warn">{n}</Chip>)}
                </div>
                <p className="mt-1 text-xs text-ink-soft">{t("setup.surplusHint")}</p>
              </div>
            )}
          </Card>
        ))}

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setPlan(null)}>{t("action.back")}</Button>
          <Button className="flex-1" disabled={busy || plan.created === 0} onClick={() => void send(true)}>
            <Check size={18} aria-hidden /> {t("setup.confirmCreate", { count: String(plan.created) })}
          </Button>
        </div>
        {plan.created === 0 && <p className="text-center text-xs text-ink-soft">{t("setup.nothingToCreate")}</p>}
      </div>
    )
  }

  // Step 1: the floor plan. The total is the sum of the floors, never typed in on its own.
  return (
    <div className="space-y-4">
      <PageHeader title={t("setup.roomsTitle")} subtitle={t("setup.roomsLead")} back="/settings/rooms" />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}

      <Card>
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.floor} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 shadow-[var(--shadow-card)]">
              <div className="min-w-0 flex-1">
                <input
                  value={row.name}
                  placeholder={t("setup.floorN", { n: String(row.floor) })}
                  aria-label={t("setup.floorName")}
                  onChange={(e) => setRows(rows.map((r) => (r.floor === row.floor ? { ...r, name: e.target.value } : r)))}
                  className="w-full border-0 bg-transparent p-0 text-sm font-semibold focus:ring-0"
                />
                <p className="text-xs text-ink-soft">{t("setup.floorNumbersHint", { n: String(row.floor) })}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="secondary" size="sm" aria-label={t("action.remove")} onClick={() => setRooms(row.floor, row.rooms - 1)}>
                  <Minus size={16} aria-hidden />
                </Button>
                <input
                  type="number"
                  min={0}
                  max={limits.maxRoomsPerFloor}
                  value={row.rooms}
                  aria-label={t("setup.roomsOnFloor", { n: String(row.floor) })}
                  onChange={(e) => setRooms(row.floor, Number(e.target.value))}
                  className="w-16 text-center tabular-nums"
                />
                <Button variant="secondary" size="sm" aria-label={t("action.add")} onClick={() => setRooms(row.floor, row.rooms + 1)}>
                  <Plus size={16} aria-hidden />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Button variant="soft" size="sm" disabled={rows.length >= limits.maxFloors}
            onClick={() => setRows([...rows, { floor: Math.max(...rows.map((r) => r.floor)) + 1, rooms: rows.at(-1)?.rooms ?? 10, name: "" }])}>
            <Layers size={16} aria-hidden /> {t("setup.addFloor")}
          </Button>
          <p className="text-sm font-bold tabular-nums" aria-live="polite">{t("setup.totalRooms")}: {total}</p>
        </div>
      </Card>

      {types.length > 1 && (
        <Card>
          <Field label={t("booking.roomType")} hint={t("setup.setupTypeHint")}>
            <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              {types.filter((ty) => !ty.dormitory).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
          </Field>
        </Card>
      )}

      <Button size="lg" className="w-full" disabled={busy || total === 0} onClick={() => void send(false)}>
        {t("setup.showPreview")}
      </Button>
    </div>
  )
}
