"use client"

/**
 * Rooms and the rate card (PRD P2–P4).
 *
 * A property is configured once, usually by us sitting next to the manager, so the screen favours getting
 * eighty rooms in quickly: room types carry the rate, and rooms are added as a number range. A dormitory
 * type sells beds, and its beds are created with each room. Tapping a room edits it (its building, floor and
 * type) and, for a dormitory, its beds.
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
  const [building, setBuilding] = useState("")
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  const [newBed, setNewBed] = useState("")

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

  const saveRoom = (room: Room) =>
    run(async () => {
      await api(`/api/rooms/${room.id}`, { method: "PUT", body: { roomTypeId: room.roomTypeId, number: room.number, floor: room.floor, active: room.active, building: room.building } })
      setEditingRoom(null)
    })

  /** Beds change the room on the server; the sheet shows the room it sends back. */
  const bedAction = (action: () => Promise<Room>) =>
    run(async () => {
      setEditingRoom(await action())
      setNewBed("")
    })

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
        amenities: type.amenities ?? [],
      }
      if (type.id) await api(`/api/room-types/${type.id}`, { method: "PUT", body })
      else await api("/api/room-types", { method: "POST", body })
      setEditing(null)
    })

  const addRooms = () =>
    run(async () => {
      await api("/api/rooms/bulk", { method: "POST", body: { roomTypeId: typeId, range, floor, building } })
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
              <button key={r.id} type="button" onClick={() => setEditingRoom(r)}
                className={`min-h-[44px] rounded-lg border border-line bg-surface px-3 text-xs font-semibold tabular-nums hover:bg-surface-2 ${r.active ? "" : "line-through opacity-60"}`}>
                {r.building ? `${r.building} ` : ""}{r.number}
              </button>
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
            <Field label={t("setup.amenities")} hint={t("setup.amenitiesHint")}>
              <input value={(editing.amenities ?? []).join(", ")} onChange={(e) => setEditing({ ...editing, amenities: e.target.value.split(",").map((a) => a.trimStart()) })} />
            </Field>
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
          <Field label={t("setup.building")} hint={t("setup.buildingHint")}>
            <input value={building} onChange={(e) => setBuilding(e.target.value)} />
          </Field>
        </div>
      </Sheet>

      <Sheet
        open={editingRoom !== null}
        onOpenChange={(o) => !o && setEditingRoom(null)}
        title={editingRoom ? `${t("nav.rooms")} ${editingRoom.number}` : ""}
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setEditingRoom(null)}>{t("action.cancel")}</Button>
            <Button className="flex-1" disabled={busy || !editingRoom?.number.trim()} onClick={() => editingRoom && saveRoom(editingRoom)}>{t("action.save")}</Button>
          </>
        }
      >
        {editingRoom && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("setup.roomNumber")}>
                <input value={editingRoom.number} onChange={(e) => setEditingRoom({ ...editingRoom, number: e.target.value })} />
              </Field>
              <Field label={t("setup.floorNumber")}>
                <input type="number" value={editingRoom.floor} onChange={(e) => setEditingRoom({ ...editingRoom, floor: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label={t("setup.building")} hint={t("setup.buildingHint")}>
              <input value={editingRoom.building} onChange={(e) => setEditingRoom({ ...editingRoom, building: e.target.value })} />
            </Field>
            <Field label={t("booking.roomType")}>
              <select value={editingRoom.roomTypeId} onChange={(e) => setEditingRoom({ ...editingRoom, roomTypeId: e.target.value })}
                disabled={data.types.find((ty) => ty.id === editingRoom.roomTypeId)?.dormitory}>
                {data.types.filter((ty) => ty.dormitory === !!data.types.find((x) => x.id === editingRoom.roomTypeId)?.dormitory).map((type) => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </Field>
            <label className="flex gap-3 text-sm">
              <input type="checkbox" checked={editingRoom.active} onChange={(e) => setEditingRoom({ ...editingRoom, active: e.target.checked })} />
              <span>{t("setup.roomInUse")}</span>
            </label>
            {editingRoom.beds.length > 0 && (
              <>
                <SectionLabel>{t("setup.beds")}</SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {editingRoom.beds.map((bed) => (
                    <button key={bed.id} type="button" disabled={busy}
                      onClick={() => bedAction(() => api<Room>(`/api/beds/${bed.id}`, { method: "PATCH", body: { active: !bed.active } }))}
                      className={`min-h-[44px] rounded-lg border border-line px-3 text-xs font-semibold tabular-nums hover:bg-surface-2 ${bed.active ? "bg-surface" : "bg-surface-2 line-through opacity-60"}`}
                      title={bed.active ? t("setup.bedOff") : t("setup.bedOn")}>
                      {bed.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={newBed} onChange={(e) => setNewBed(e.target.value)} placeholder={`${editingRoom.number}-${editingRoom.beds.length + 1}`} />
                  <Button variant="secondary" disabled={busy}
                    onClick={() => bedAction(() => api<Room>(`/api/rooms/${editingRoom.id}/beds`, { method: "POST", body: { label: newBed || null } }))}>
                    <Plus size={16} aria-hidden /> {t("setup.addBed")}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}
