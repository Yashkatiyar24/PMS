import type { Tone } from "@/theme/tones"
import type { Colors } from "@/theme/types"

import type { Room, RoomStatus } from "../types"

export function statusTone(status: RoomStatus): Tone {
  switch (status) {
    case "clean":
    case "inspected":
      return "ok"
    case "dirty":
      return "danger"
    case "cleaning":
      return "info"
    default:
      return "danger"
  }
}

/** The three buckets the web's subtitle counts: clean (clean+inspected), dirty (dirty+cleaning), blocked (blocked+maintenance). */
export function statusBucket(status: RoomStatus): "clean" | "dirty" | "blocked" {
  if (status === "clean" || status === "inspected") return "clean"
  if (status === "dirty" || status === "cleaning") return "dirty"
  return "blocked"
}

export type RoomFilter = "all" | "mine" | "clean" | "dirty" | "blocked"

export function filterRooms(rooms: Room[], filter: RoomFilter, userId: string | null): Room[] {
  switch (filter) {
    case "mine":
      return rooms.filter((r) => r.housekeeperId === userId)
    case "all":
      return rooms
    default:
      return rooms.filter((r) => statusBucket(r.status) === filter)
  }
}

/** Rooms grouped by building then floor, in a stable order. */
export function groupRooms(rooms: Room[]): { key: string; title: string; rooms: Room[] }[] {
  const map = new Map<string, Room[]>()
  for (const r of rooms) {
    const key = `${r.building}||${r.floor}`
    map.set(key, [...(map.get(key) ?? []), r])
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([key, list]) => {
      const [building, floor] = key.split("||")
      return {
        key,
        title: [building, `Floor ${floor}`].filter(Boolean).join(" · "),
        rooms: list.sort((x, y) => x.number.localeCompare(y.number, undefined, { numeric: true })),
      }
    })
}

/** "Occupied" / "Reserved" / "n/m beds" / "Available". */
export function occupancySummary(room: Room): {
  key: "occupied" | "reserved" | "beds" | "available"
  taken?: number
  total?: number
} {
  if (room.beds.length > 0) {
    const active = room.beds.filter((b) => b.active)
    const taken = active.filter((b) => b.occupancy).length
    return { key: "beds", taken, total: active.length }
  }
  if (room.occupancy) return { key: room.occupancy.state }
  return { key: "available" }
}

/** The status buttons the web offers for a room in this state. */
export function nextStatuses(status: RoomStatus): { to: RoomStatus; label: string }[] {
  switch (status) {
    case "blocked":
      return [{ to: "clean", label: "rooms.unblock" }]
    case "maintenance":
      return [{ to: "dirty", label: "rooms.repairDone" }]
    case "dirty":
      return [
        { to: "clean", label: "rooms.markClean" },
        { to: "cleaning", label: "rooms.startCleaning" },
      ]
    case "cleaning":
      return [{ to: "clean", label: "rooms.markClean" }]
    case "clean":
      return [
        { to: "inspected", label: "rooms.markInspected" },
        { to: "dirty", label: "rooms.markDirty" },
      ]
    case "inspected":
      return [{ to: "dirty", label: "rooms.markDirty" }]
  }
}

/** The board's colour for one room: a fill, its ink, the edge and the status dot. Occupied is told by `taken`. */
export function chipLook(
  colors: Colors,
  room: Room,
): { bg: string; fg: string; border: string; dot: string; taken: boolean } {
  const p = colors.palette
  const occ = occupancySummary(room)
  const taken = occ.key === "occupied" || (occ.key === "beds" && (occ.taken ?? 0) > 0)
  switch (room.status) {
    case "dirty":
      return { bg: p.dangerSoft, fg: p.danger, border: p.dangerSoft, dot: p.danger, taken }
    case "cleaning":
      return { bg: p.warnSoft, fg: p.warn, border: p.warnSoft, dot: p.warn, taken }
    case "inspected":
      return { bg: p.brandSoft, fg: p.brandInk, border: p.brandSoft, dot: p.brand, taken }
    case "clean":
      return { bg: colors.surface, fg: colors.text, border: colors.border, dot: p.ok, taken }
    default:
      return { bg: p.neutralSoft, fg: colors.textDim, border: p.neutralSoft, dot: p.neutral, taken }
  }
}
