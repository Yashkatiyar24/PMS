"use client"

/**
 * Rooms and the rate card (PRD P2–P4).
 *
 * A property is configured once, usually by us sitting next to the manager, so the screen favours getting
 * eighty rooms in quickly: room types carry the rate, and rooms are added as a number range. A dormitory
 * type sells beds, and its beds are created with each room.
 */
import { useState } from "react"
import Link from "next/link"
import { api, ApiError } from "@/lib/api"
import { rupees, toPaise } from "@/lib/format"
import type { Room, RoomType } from "@/lib/types"
import { useResource } from "@/lib/use-resource"
import { useI18n } from "@/i18n"
import { Banner, Button, Card, Chip, Empty, Field, Loading } from "@/components/ui"

export default function RoomSetupPage() {
  const { t } = useI18n()
  const { data, reload } = useResource(
    async () => {
      const [types, rooms] = await Promise.all([api<RoomType[]>("/api/room-types"), api<Room[]>("/api/rooms")])
      return { types, rooms }
    },
    [],
    t("error.generic"),
  )

  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Partial<RoomType> | null>(null)
  const [range, setRange] = useState("")
  const [floor, setFloor] = useState(1)
  const [rangeTypeId, setRangeTypeId] = useState("")

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

  const saveType = (type: Partial<RoomType>) =>
    run(async () => {
      const body = {
        name: type.name,
        baseRatePaise: type.baseRatePaise ?? 0,
        maxOccupancy: type.maxOccupancy ?? 2,
        extraPersonPaise: type.extraPersonPaise ?? 0,
        dormitory: type.dormitory ?? false,
        bedCount: type.bedCount ?? 0,
        sortOrder: type.sortOrder ?? 0,
        active: type.active ?? true,
      }
      if (type.id) await api(`/api/room-types/${type.id}`, { method: "PUT", body })
      else await api("/api/room-types", { method: "POST", body })
      setEditing(null)
    })

  const addRooms = () =>
    run(async () => {
      await api("/api/rooms/bulk", { method: "POST", body: { roomTypeId: rangeTypeId, range, floor } })
      setRange("")
    })

  if (!data) return <Loading />
  const typeId = rangeTypeId || data.types[0]?.id || ""

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("setup.roomTypes")}</h1>
      {error && <Banner tone="danger">{error}</Banner>}

      <ul className="space-y-2">
        {data.types.map((type) => (
          <li key={type.id}>
            <Card className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{type.name}</p>
                <p className="text-sm text-[var(--color-ink-soft)]">
                  {rupees(type.baseRatePaise)} · {type.dormitory ? `${type.bedCount} beds` : `${type.maxOccupancy} guests`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {type.dormitory && <Chip tone="info">dorm</Chip>}
                <Button variant="secondary" className="px-3 py-2 text-sm" onClick={() => setEditing(type)}>
                  {t("action.save")}
                </Button>
              </div>
            </Card>
          </li>
        ))}
        {data.types.length === 0 && <Empty />}
      </ul>

      {editing === null ? (
        <Button variant="secondary" className="w-full" onClick={() => setEditing({ maxOccupancy: 2, dormitory: false })}>
          {t("setup.addRoomType")}
        </Button>
      ) : (
        <Card className="space-y-3">
          <Field label={t("setup.name")}>
            <input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("setup.rate")}>
              <input
                inputMode="decimal"
                value={editing.baseRatePaise ? String(editing.baseRatePaise / 100) : ""}
                onChange={(e) => setEditing({ ...editing, baseRatePaise: toPaise(e.target.value) })}
              />
            </Field>
            <Field label={t("setup.extraPerson")}>
              <input
                inputMode="decimal"
                value={editing.extraPersonPaise ? String(editing.extraPersonPaise / 100) : ""}
                onChange={(e) => setEditing({ ...editing, extraPersonPaise: toPaise(e.target.value) })}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5"
              disabled={!!editing.id}
              checked={editing.dormitory ?? false}
              onChange={(e) => setEditing({ ...editing, dormitory: e.target.checked })}
            />
            <span>{t("setup.isDormitory")}</span>
          </label>

          {editing.dormitory ? (
            <Field label={t("setup.bedCount")}>
              <input
                type="number"
                min={1}
                value={editing.bedCount ?? 1}
                onChange={(e) => setEditing({ ...editing, bedCount: Number(e.target.value) })}
              />
            </Field>
          ) : (
            <Field label={t("setup.maxOccupancy")}>
              <input
                type="number"
                min={1}
                value={editing.maxOccupancy ?? 2}
                onChange={(e) => setEditing({ ...editing, maxOccupancy: Number(e.target.value) })}
              />
            </Field>
          )}

          <div className="flex gap-2">
            <Button className="flex-1" disabled={busy || !editing.name?.trim()} onClick={() => saveType(editing)}>
              {t("action.save")}
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(null)}>
              {t("action.cancel")}
            </Button>
          </div>
        </Card>
      )}

      <h2 className="pt-2 text-lg font-bold">
        {t("setup.rooms")} <Chip>{data.rooms.length}</Chip>
      </h2>

      <Card className="space-y-3">
        <h3 className="font-semibold">{t("setup.addRooms")}</h3>
        <Field label={t("booking.roomType")}>
          <select value={typeId} onChange={(e) => setRangeTypeId(e.target.value)}>
            {data.types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("setup.range")} hint={t("setup.rangeHint")}>
            <input value={range} onChange={(e) => setRange(e.target.value)} placeholder="101-140" />
          </Field>
          <Field label={t("setup.floorNumber")}>
            <input type="number" value={floor} onChange={(e) => setFloor(Number(e.target.value))} />
          </Field>
        </div>
        <Button className="w-full" disabled={busy || !range.trim() || !typeId} onClick={addRooms}>
          {t("action.add")}
        </Button>
      </Card>

      <Link href="/settings">
        <Button variant="ghost" className="w-full">
          {t("action.back")}
        </Button>
      </Link>
    </div>
  )
}
