"use client"

/**
 * Rooms and the rate card (PRD P2–P4).
 *
 * The inventory as the owner thinks of it: floor by floor, each floor collapsible, every room a row with its
 * type, its rate and what is happening in it. A property arrives with its floors already furnished, so the
 * usual work here is correcting rather than creating: renaming a floor, moving five rooms to Deluxe, taking
 * one out of use while the bathroom is retiled.
 *
 * Three things the screen will not let happen, because the database would not either:
 *   * a room is never deleted — a stay, a folio and a receipt all point at it, and history that says "101"
 *     must go on saying it. Out of use is as far as it goes;
 *   * a room with a guest in it, or one booked for next week, cannot be taken out of use at all until those
 *     bookings are dealt with;
 *   * a rate belongs to a room type, which is what the charge engine and the online rate card read. A room is
 *     priced by changing its type, so the type's rate is shown on the room and edited in one place.
 */
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { BedDouble, CalendarRange, LayoutGrid, Layers, Pencil, Plus, Search, UserRound } from "lucide-react"
import { clsx } from "clsx"
import { api, ApiError } from "@/lib/api"
import { rupees, toPaise } from "@/lib/format"
import { OFF_SALE, type Floor, type Room, type RoomStatus, type RoomType } from "@/lib/types"
import { useResource } from "@/lib/use-resource"
import { useI18n } from "@/i18n"
import { Avatar, Banner, Button, Card, Chip, Disclosure, Empty, Field, ListCard, ListRow, Loading, Menu, PageHeader, SectionLabel, Sheet, type Tone } from "@/components/ui"

const STATUS_TONE: Record<RoomStatus, Tone> = { clean: "ok", inspected: "ok", dirty: "warn", cleaning: "info", blocked: "danger", maintenance: "danger" }
/** Common beds, offered as a starting point; the field takes anything the property calls it. */
const BED_TYPES = ["single", "double", "twin", "triple", "bunk", "floor"]

export default function RoomSetupPage() {
  const { t } = useI18n()
  const router = useRouter()
  const { data, reload } = useResource(
    async () => {
      const [types, rooms, floors] = await Promise.all([
        api<RoomType[]>("/api/room-types"),
        api<Room[]>("/api/rooms"),
        api<Floor[]>("/api/floors"),
      ])
      return { types, rooms, floors }
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
  const [editingFloor, setEditingFloor] = useState<Floor | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [bulk, setBulk] = useState<{ roomTypeId: string; floor: string; active: string } | null>(null)
  const [query, setQuery] = useState("")
  const [filterFloor, setFilterFloor] = useState("")
  const [filterType, setFilterType] = useState("")
  const [filterStatus, setFilterStatus] = useState("")

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
      await api(`/api/rooms/${room.id}`, {
        method: "PUT",
        body: {
          roomTypeId: room.roomTypeId, number: room.number, floor: room.floor, active: room.active,
          building: room.building, name: room.name, bedType: room.bedType, description: room.description,
        },
      })
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

  /** One more room on a floor. The server says what to call it; the owner may call it something else. */
  const addOneRoom = (onFloor: number) =>
    run(async () => {
      const { number } = await api<{ number: string }>(`/api/rooms/next-number?floor=${onFloor}`)
      const room = await api<Room>("/api/rooms", { method: "POST", body: { roomTypeId: typeId, number, floor: onFloor, active: true, building: "" } })
      setEditingRoom(room)
    })

  const saveFloor = (f: Floor) =>
    run(async () => {
      await api("/api/floors", { method: "POST", body: { number: f.number, name: f.name, sortOrder: f.sortOrder } })
      setEditingFloor(null)
    })

  const removeFloor = (f: Floor) =>
    run(async () => {
      await api(`/api/floors/${f.number}`, { method: "DELETE" })
      setEditingFloor(null)
    })

  const applyBulk = () =>
    run(async () => {
      if (!bulk) return
      await api("/api/rooms/bulk-update", {
        method: "POST",
        body: {
          roomIds: selected,
          roomTypeId: bulk.roomTypeId || null,
          floor: bulk.floor === "" ? null : Number(bulk.floor),
          active: bulk.active === "" ? null : bulk.active === "yes",
        },
      })
      setBulk(null)
      setSelected([])
    })

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data?.rooms ?? []).filter((r) =>
      (!q || r.number.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.roomTypeName.toLowerCase().includes(q)) &&
      (!filterFloor || String(r.floor) === filterFloor) &&
      (!filterType || r.roomTypeId === filterType) &&
      (!filterStatus || (filterStatus === "occupied" ? r.occupancy?.state === "occupied"
        : filterStatus === "reserved" ? r.occupancy?.state === "reserved"
        : filterStatus === "free" ? !r.occupancy && !OFF_SALE.includes(r.status)
        : r.status === filterStatus)))
  }, [data, query, filterFloor, filterType, filterStatus])

  if (!data) return <Loading />
  const typeId = rangeTypeId || data.types.find((ty) => !ty.dormitory)?.id || data.types[0]?.id || ""
  const roomsOfType = (id: string) => data.rooms.filter((r) => r.roomTypeId === id).length
  const typeOf = (id: string) => data.types.find((ty) => ty.id === id)
  const floorName = (f: Floor) => f.name || t("rooms.floor", { n: String(f.number) })
  const bedLabel = (bed: string) => (BED_TYPES.includes(bed) ? t(`setup.bed.${bed}` as "setup.bed.double") : bed)
  const floorsShown = data.floors.filter((f) => shown.some((r) => r.floor === f.number))
  const filtering = Boolean(query || filterFloor || filterType || filterStatus)

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("setup.rooms")}
        subtitle={`${data.rooms.length} · ${data.floors.length} ${t("setup.floors").toLowerCase()} · ${data.types.length} ${t("setup.roomTypes").toLowerCase()}`}
        back="/settings"
        actions={
          <Menu
            trigger={<Button size="sm"><Plus size={16} aria-hidden /> {t("action.add")}</Button>}
            items={[
              { label: t("setup.planRooms"), icon: LayoutGrid, href: "/settings/rooms/setup" },
              { label: t("setup.addRooms"), icon: Plus, onSelect: () => setAddingRooms(true), disabled: data.types.length === 0 },
              { label: t("setup.addFloor"), icon: Layers, onSelect: () => setEditingFloor({ id: null, number: Math.max(0, ...data.floors.map((f) => f.number)) + 1, name: "", sortOrder: 0, rooms: 0 }) },
              { label: t("setup.addRoomType"), icon: BedDouble, onSelect: () => setEditing({ maxOccupancy: 2, dormitory: false }) },
            ]}
          />
        }
      />
      {error && <Banner tone="danger" onClose={() => setError("")}>{error}</Banner>}

      {/* An empty inventory is the one case where this screen leads with the plan instead of the list. */}
      {data.rooms.length === 0 && (
        <Card className="space-y-3">
          <p className="font-semibold">{t("setup.noRoomsYet")}</p>
          <p className="text-sm text-ink-soft">{t("setup.noRoomsYetHint")}</p>
          <Button className="w-full" onClick={() => router.push("/settings/rooms/setup")}><LayoutGrid size={18} aria-hidden /> {t("setup.planRooms")}</Button>
        </Card>
      )}

      {data.rooms.length > 0 && (
        <>
          {/* Search and the three filters an owner actually uses. On a phone they wrap to two rows. */}
          <Card>
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[8rem] flex-1">
                <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("setup.searchRooms")} aria-label={t("setup.searchRooms")} className="pl-9" />
              </div>
              <select value={filterFloor} onChange={(e) => setFilterFloor(e.target.value)} aria-label={t("setup.floorNumber")} className="w-auto min-w-[7rem] flex-none">
                <option value="">{t("setup.allFloors")}</option>
                {data.floors.map((f) => <option key={f.number} value={f.number}>{floorName(f)}</option>)}
              </select>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} aria-label={t("booking.roomType")} className="w-auto min-w-[7rem] flex-none">
                <option value="">{t("setup.allTypes")}</option>
                {data.types.map((ty) => <option key={ty.id} value={ty.id}>{ty.name}</option>)}
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label={t("dash.col.status")} className="w-auto min-w-[7rem] flex-none">
                <option value="">{t("setup.allStatuses")}</option>
                <option value="free">{t("setup.statusFree")}</option>
                <option value="occupied">{t("setup.statusOccupied")}</option>
                <option value="reserved">{t("setup.statusReserved")}</option>
                {(["clean", "dirty", "cleaning", "inspected", "blocked", "maintenance"] as RoomStatus[]).map((s) => (
                  <option key={s} value={s}>{t(`rooms.status.${s}` as "rooms.status.clean")}</option>
                ))}
              </select>
            </div>
            {filtering && <p className="mt-2 text-xs text-ink-soft">{t("setup.matching", { n: String(shown.length) })}</p>}
          </Card>

          {/* Selected rooms, and the one bar that changes them all at once. */}
          {selected.length > 0 && (
            <Card className="sticky top-16 z-10 flex flex-wrap items-center justify-between gap-2 border-brand/40">
              <p className="text-sm font-semibold">{t("setup.selected", { n: String(selected.length) })}</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setSelected([])}>{t("action.cancel")}</Button>
                <Button size="sm" onClick={() => setBulk({ roomTypeId: "", floor: "", active: "" })}>
                  <Pencil size={14} aria-hidden /> {t("setup.bulkEdit")}
                </Button>
              </div>
            </Card>
          )}

          {floorsShown.length === 0 ? (
            <Empty icon={Search}>{t("setup.noRoomsMatch")}</Empty>
          ) : (
            floorsShown.map((f) => {
              const rooms = shown.filter((r) => r.floor === f.number)
              const ids = rooms.map((r) => r.id)
              const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id))
              return (
                <Disclosure
                  key={f.number}
                  defaultOpen={data.floors.length <= 4 || filtering}
                  title={floorName(f)}
                  summary={t("setup.nRooms", { n: String(rooms.length) })}
                >
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Button variant="soft" size="sm" onClick={() => setEditingFloor(f)}><Pencil size={14} aria-hidden /> {t("setup.editFloor")}</Button>
                    <Button variant="soft" size="sm" disabled={busy || !typeId} onClick={() => addOneRoom(f.number)}><Plus size={14} aria-hidden /> {t("setup.addRoom")}</Button>
                    <Button variant="ghost" size="sm" onClick={() => setSelected((s) => (allSelected ? s.filter((id) => !ids.includes(id)) : [...new Set([...s, ...ids])]))}>
                      {allSelected ? t("setup.selectNone") : t("setup.selectAll")}
                    </Button>
                  </div>
                  <ListCard>
                    {rooms.map((room) => {
                      const type = typeOf(room.roomTypeId)
                      const taken = room.occupancy
                      return (
                        // The tick box sits beside the row rather than inside it: a checkbox within a button is
                        // a control inside a control, which no browser and no screen reader handles well.
                        <div key={room.id} className="flex items-center gap-1 pl-2">
                        <label className="grid h-11 w-9 shrink-0 place-items-center">
                          <input type="checkbox" checked={selected.includes(room.id)} onChange={() => toggle(room.id)} aria-label={t("setup.selectRoom", { number: room.number })} />
                        </label>
                        <ListRow
                          className="min-w-0 flex-1"
                          onClick={() => setEditingRoom(room)}
                          title={`${room.building ? `${room.building} ` : ""}${room.number}${room.name ? ` · ${room.name}` : ""}`}
                          subtitle={[type?.name, type && rupees(type.baseRatePaise), room.bedType && bedLabel(room.bedType)].filter(Boolean).join(" · ")}
                          right={
                            <span className="flex items-center gap-1.5">
                              {!room.active && <Chip tone="neutral">{t("setup.archived")}</Chip>}
                              {taken ? (
                                <Chip tone={taken.state === "occupied" ? "danger" : "info"} title={taken.guestName}>
                                  {taken.state === "occupied" ? <UserRound size={12} aria-hidden /> : <CalendarRange size={12} aria-hidden />}
                                  {" "}{t(taken.state === "occupied" ? "setup.statusOccupied" : "setup.statusReserved")}
                                </Chip>
                              ) : (
                                <Chip tone={STATUS_TONE[room.status]}>{t(`rooms.status.${room.status}` as "rooms.status.clean")}</Chip>
                              )}
                            </span>
                          }
                          chevron
                        />
                        </div>
                      )
                    })}
                  </ListCard>
                </Disclosure>
              )
            })
          )}
        </>
      )}

      <SectionLabel>{t("setup.roomTypes")}</SectionLabel>
      {data.types.length === 0 ? (
        <Empty icon={BedDouble} action={<Button variant="soft" size="sm" onClick={() => setEditing({ maxOccupancy: 2, dormitory: false })}>{t("setup.addRoomType")}</Button>}>{t("empty.roomTypes")}</Empty>
      ) : (
        <ListCard>
          {data.types.map((type) => (
            <ListRow
              key={type.id}
              onClick={() => setEditing(type)}
              leading={<Avatar name={type.name} tone={type.dormitory ? "violet" : "teal"} size={38} />}
              title={type.name}
              subtitle={`${rupees(type.baseRatePaise)} · ${type.dormitory ? `${type.bedCount} ${t("setup.beds").toLowerCase()}` : `${type.maxOccupancy} ${t("setup.maxOccupancy").toLowerCase()}`} · ${t("setup.rooms")} ${roomsOfType(type.id)}`}
              right={!type.active ? <Chip tone="neutral">{t("setup.archived")}</Chip> : type.dormitory ? <Chip tone="violet">dorm</Chip> : undefined}
              chevron
            />
          ))}
        </ListCard>
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
            {/* A type is never deleted — a stay booked at its rate still points at it — but it can be retired,
                which is the only way to get a type created by mistake off the check-in screen. Its rooms go
                off sale with it, so the sheet says how many that is before anybody ticks it. */}
            {editing.id && (
              <>
                <label className="flex gap-3 text-sm">
                  <input type="checkbox" checked={editing.active ?? true} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                  <span>{t("setup.typeInUse")}</span>
                </label>
                {editing.active === false && roomsOfType(editing.id) > 0 && (
                  <Banner tone="warn">{t("setup.typeRetiredWarning", { n: String(roomsOfType(editing.id)) })}</Banner>
                )}
              </>
            )}
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

      {/* A floor is a name and a place in the list; its rooms are moved or taken out of use one by one. */}
      <Sheet
        open={editingFloor !== null}
        onOpenChange={(o) => !o && setEditingFloor(null)}
        title={editingFloor ? t("setup.editFloor") : ""}
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setEditingFloor(null)}>{t("action.cancel")}</Button>
            <Button className="flex-1" disabled={busy} onClick={() => editingFloor && saveFloor(editingFloor)}>{t("action.save")}</Button>
          </>
        }
      >
        {editingFloor && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("setup.floorNumber")}>
                <input type="number" value={editingFloor.number} disabled={editingFloor.rooms > 0}
                  onChange={(e) => setEditingFloor({ ...editingFloor, number: Number(e.target.value) })} />
              </Field>
              <Field label={t("setup.sortOrder")}>
                <input type="number" value={editingFloor.sortOrder} onChange={(e) => setEditingFloor({ ...editingFloor, sortOrder: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label={t("setup.floorName")} hint={t("setup.floorNameHint")}>
              <input value={editingFloor.name} placeholder={t("rooms.floor", { n: String(editingFloor.number) })}
                onChange={(e) => setEditingFloor({ ...editingFloor, name: e.target.value })} autoFocus />
            </Field>
            {editingFloor.rooms > 0 ? (
              <p className="text-xs text-ink-soft">{t("setup.floorHasRooms", { n: String(editingFloor.rooms) })}</p>
            ) : (
              <Button variant="secondary" className="w-full" disabled={busy} onClick={() => removeFloor(editingFloor)}>{t("setup.deleteFloor")}</Button>
            )}
          </div>
        )}
      </Sheet>

      <Sheet
        open={bulk !== null}
        onOpenChange={(o) => !o && setBulk(null)}
        title={t("setup.bulkEdit")}
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setBulk(null)}>{t("action.cancel")}</Button>
            <Button className="flex-1" disabled={busy || !bulk || (!bulk.roomTypeId && bulk.floor === "" && bulk.active === "")} onClick={applyBulk}>
              {t("setup.applyToN", { n: String(selected.length) })}
            </Button>
          </>
        }
      >
        {bulk && (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">{t("setup.bulkHint")}</p>
            <Field label={t("booking.roomType")}>
              <select value={bulk.roomTypeId} onChange={(e) => setBulk({ ...bulk, roomTypeId: e.target.value })}>
                <option value="">{t("setup.leaveUnchanged")}</option>
                {data.types.filter((ty) => !ty.dormitory).map((ty) => <option key={ty.id} value={ty.id}>{ty.name}</option>)}
              </select>
            </Field>
            <Field label={t("setup.moveToFloor")}>
              <select value={bulk.floor} onChange={(e) => setBulk({ ...bulk, floor: e.target.value })}>
                <option value="">{t("setup.leaveUnchanged")}</option>
                {data.floors.map((f) => <option key={f.number} value={f.number}>{floorName(f)}</option>)}
              </select>
            </Field>
            <Field label={t("setup.roomInUse")}>
              <select value={bulk.active} onChange={(e) => setBulk({ ...bulk, active: e.target.value })}>
                <option value="">{t("setup.leaveUnchanged")}</option>
                <option value="yes">{t("setup.inUse")}</option>
                <option value="no">{t("setup.outOfUse")}</option>
              </select>
            </Field>
          </div>
        )}
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
            {editingRoom.occupancy && (
              <Banner tone="info">{t("setup.roomBusy", { guest: editingRoom.occupancy.guestName })}</Banner>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("setup.roomNumber")}>
                <input value={editingRoom.number} maxLength={12} onChange={(e) => setEditingRoom({ ...editingRoom, number: e.target.value })} />
              </Field>
              <Field label={t("setup.floorNumber")}>
                <input type="number" value={editingRoom.floor} onChange={(e) => setEditingRoom({ ...editingRoom, floor: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label={t("setup.roomName")} hint={t("setup.roomNameHint")}>
              <input value={editingRoom.name} maxLength={60} onChange={(e) => setEditingRoom({ ...editingRoom, name: e.target.value })} />
            </Field>
            <Field label={t("setup.building")} hint={t("setup.buildingHint")}>
              <input value={editingRoom.building} onChange={(e) => setEditingRoom({ ...editingRoom, building: e.target.value })} />
            </Field>
            <Field label={t("booking.roomType")} hint={t("setup.rateFromType")}>
              <select value={editingRoom.roomTypeId} onChange={(e) => setEditingRoom({ ...editingRoom, roomTypeId: e.target.value })}
                disabled={typeOf(editingRoom.roomTypeId)?.dormitory}>
                {data.types.filter((ty) => ty.dormitory === !!typeOf(editingRoom.roomTypeId)?.dormitory).map((type) => (
                  <option key={type.id} value={type.id}>{type.name} · {rupees(type.baseRatePaise)}</option>
                ))}
              </select>
            </Field>
            {/* The rate and the occupancy are the type's, shown here and edited in one place. */}
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <span className="font-semibold tabular-nums">{rupees(typeOf(editingRoom.roomTypeId)?.baseRatePaise ?? 0)}</span>
              <span className="text-ink-soft">· {typeOf(editingRoom.roomTypeId)?.maxOccupancy ?? 0} {t("setup.maxOccupancy").toLowerCase()}</span>
              <button type="button" className="ml-auto font-semibold text-brand-ink"
                onClick={() => { const ty = typeOf(editingRoom.roomTypeId); setEditingRoom(null); if (ty) setEditing(ty) }}>
                {t("setup.editType")}
              </button>
            </div>
            <Field label={t("setup.bedType")}>
              <select value={BED_TYPES.includes(editingRoom.bedType) ? editingRoom.bedType : ""} onChange={(e) => setEditingRoom({ ...editingRoom, bedType: e.target.value })}>
                <option value="">—</option>
                {BED_TYPES.map((b) => <option key={b} value={b}>{t(`setup.bed.${b}` as "setup.bed.double")}</option>)}
              </select>
            </Field>
            <Field label={t("setup.roomDescription")}>
              <textarea rows={2} value={editingRoom.description} maxLength={500} onChange={(e) => setEditingRoom({ ...editingRoom, description: e.target.value })} />
            </Field>
            <label className="flex gap-3 text-sm">
              <input type="checkbox" checked={editingRoom.active} onChange={(e) => setEditingRoom({ ...editingRoom, active: e.target.checked })} />
              <span>{t("setup.roomInUse")}</span>
            </label>
            <p className="text-xs text-ink-soft">{t("setup.neverDeleted")}</p>
            {editingRoom.beds.length > 0 && (
              <>
                <SectionLabel>{t("setup.beds")}</SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {editingRoom.beds.map((bed) => (
                    <button key={bed.id} type="button" disabled={busy}
                      onClick={() => bedAction(() => api<Room>(`/api/beds/${bed.id}`, { method: "PATCH", body: { active: !bed.active } }))}
                      className={clsx("min-h-[44px] rounded-lg border border-line px-3 text-xs font-semibold tabular-nums hover:bg-surface-2",
                        bed.active ? "bg-surface" : "bg-surface-2 line-through opacity-60")}
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
