"use client"

/**
 * Rooms and the rate card (PRD P2–P4).
 *
 * A property is configured once, usually by us sitting next to the manager, so the screen favours getting
 * eighty rooms in quickly: room types carry the rate, and rooms are added as a number range. A dormitory
 * type sells beds, and its beds are created with each room.
 */
import { useState } from "react"
import { BedDouble, Plus } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { rupees, toPaise } from "@/lib/format"
import type { Room, RoomType } from "@/lib/types"
import { useResource } from "@/lib/use-resource"
import { useI18n } from "@/i18n"
import { Avatar, Banner, Button, Chip, Empty, Field, ListCard, ListRow, Loading, Menu, PageHeader, SectionLabel, Sheet } from "@/components/ui"

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
  const [addingRooms, setAddingRooms] = useState(false)
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
      await api("/api/rooms/bulk", { method: "POST", body: { roomTypeId: typeId, range, floor } })
      setRange("")
      setAddingRooms(false)
    })

  if (!data) return <Loading />
  const typeId = rangeTypeId || data.types[0]?.id || ""
  const roomsOfType = (id: string) => data.rooms.filter((r) => r.roomTypeId === id).length

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("setup.roomTypes")}
        subtitle={`${data.types.length} · ${t("setup.rooms")} ${data.rooms.length}`}
        back="/settings"
        actions={
          <Menu
            trigger={<Button size="sm"><Plus size={16} aria-hidden /> {t("action.add")}</Button>}
            items={[
              { label: t("setup.addRoomType"), icon: BedDouble, onSelect: () => setEditing({ maxOccupancy: 2, dormitory: false }) },
              { label: t("setup.addRooms"), icon: Plus, onSelect: () => setAddingRooms(true), disabled: data.types.length === 0 },
            ]}
          />
        }
      />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}

      {data.types.length === 0 ? (
        <Empty icon={BedDouble} action={<Button variant="soft" size="sm" onClick={() => setEditing({ maxOccupancy: 2, dormitory: false })}>{t("setup.addRoomType")}</Button>} />
      ) : (
        <ListCard>
          {data.types.map((type) => (
            <ListRow
              key={type.id}
              onClick={() => setEditing(type)}
              leading={<Avatar name={type.name} tone={type.dormitory ? "violet" : "teal"} size={38} />}
              title={type.name}
              subtitle={`${rupees(type.baseRatePaise)} · ${type.dormitory ? `${type.bedCount} beds` : `${type.maxOccupancy} guests`} · ${t("setup.rooms")} ${roomsOfType(type.id)}`}
              right={type.dormitory ? <Chip tone="violet">dorm</Chip> : undefined}
              chevron
            />
          ))}
        </ListCard>
      )}

      {data.rooms.length > 0 && (
        <>
          <SectionLabel>{t("setup.rooms")}</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {data.rooms.map((r) => (
              <span key={r.id} className="rounded-lg border border-line bg-surface px-2 py-1 text-xs font-semibold tabular-nums">{r.number}</span>
            ))}
          </div>
        </>
      )}

      <Sheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.id ? t("setup.editRoomType") : t("setup.addRoomType")}
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(null)}>{t("action.cancel")}</Button>
            <Button className="flex-1" disabled={busy || !editing?.name?.trim()} onClick={() => editing && saveType(editing)}>{t("action.save")}</Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <Field label={t("setup.name")}>
              <input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("setup.rate")}>
                <input inputMode="decimal" value={editing.baseRatePaise ? String(editing.baseRatePaise / 100) : ""} onChange={(e) => setEditing({ ...editing, baseRatePaise: toPaise(e.target.value) })} />
              </Field>
              <Field label={t("setup.extraPerson")}>
                <input inputMode="decimal" value={editing.extraPersonPaise ? String(editing.extraPersonPaise / 100) : ""} onChange={(e) => setEditing({ ...editing, extraPersonPaise: toPaise(e.target.value) })} />
              </Field>
            </div>
            <label className="flex gap-3 text-sm">
              <input type="checkbox" disabled={!!editing.id} checked={editing.dormitory ?? false} onChange={(e) => setEditing({ ...editing, dormitory: e.target.checked })} />
              <span>{t("setup.isDormitory")}</span>
            </label>
            {editing.dormitory ? (
              <Field label={t("setup.bedCount")}>
                <input type="number" min={1} value={editing.bedCount ?? 1} onChange={(e) => setEditing({ ...editing, bedCount: Number(e.target.value) })} />
              </Field>
            ) : (
              <Field label={t("setup.maxOccupancy")}>
                <input type="number" min={1} value={editing.maxOccupancy ?? 2} onChange={(e) => setEditing({ ...editing, maxOccupancy: Number(e.target.value) })} />
              </Field>
            )}
          </div>
        )}
      </Sheet>

      <Sheet
        open={addingRooms}
        onOpenChange={setAddingRooms}
        title={t("setup.addRooms")}
        footer={<Button size="lg" className="w-full" disabled={busy || !range.trim() || !typeId} onClick={addRooms}>{t("action.add")}</Button>}
      >
        <div className="space-y-3">
          <Field label={t("booking.roomType")}>
            <select value={typeId} onChange={(e) => setRangeTypeId(e.target.value)}>
              {data.types.map((type) => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("setup.range")} hint={t("setup.rangeHint")}>
              <input value={range} onChange={(e) => setRange(e.target.value)} placeholder="101-140" autoFocus />
            </Field>
            <Field label={t("setup.floorNumber")}>
              <input type="number" value={floor} onChange={(e) => setFloor(Number(e.target.value))} />
            </Field>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
