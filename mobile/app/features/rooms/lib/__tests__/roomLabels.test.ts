import type { Room } from "../../types"
import {
  filterRooms,
  groupRooms,
  nextStatuses,
  occupancySummary,
  statusBucket,
} from "../roomLabels"

const room = (over: Partial<Room>): Room => ({
  id: "r",
  roomTypeId: "t",
  roomTypeName: "AC",
  number: "101",
  floor: 1,
  status: "clean",
  blockedReason: null,
  blockedUntil: null,
  active: true,
  beds: [],
  building: "",
  housekeeperId: null,
  housekeeperName: null,
  hkPriority: "normal",
  hkNote: "",
  occupancy: null,
  ...over,
})

describe("room helpers", () => {
  it("buckets statuses like the web subtitle", () => {
    expect(statusBucket("inspected")).toBe("clean")
    expect(statusBucket("cleaning")).toBe("dirty")
    expect(statusBucket("maintenance")).toBe("blocked")
  })

  it("filters by bucket and by housekeeper", () => {
    const rooms = [
      room({ id: "a", status: "dirty", housekeeperId: "u1" }),
      room({ id: "b", status: "blocked" }),
    ]
    expect(filterRooms(rooms, "dirty", null).map((r) => r.id)).toEqual(["a"])
    expect(filterRooms(rooms, "mine", "u1").map((r) => r.id)).toEqual(["a"])
    expect(filterRooms(rooms, "all", null)).toHaveLength(2)
  })

  it("groups by building and floor with natural room order", () => {
    const groups = groupRooms([
      room({ number: "110", floor: 1 }),
      room({ number: "9", floor: 1 }),
      room({ number: "201", floor: 2, building: "Annex" }),
    ])
    expect(groups.map((g) => g.title)).toEqual(["Floor 1", "Annex · Floor 2"])
    expect(groups[0].rooms.map((r) => r.number)).toEqual(["9", "110"])
  })

  it("summarises occupancy", () => {
    expect(occupancySummary(room({}))).toEqual({ key: "available" })
    expect(
      occupancySummary(
        room({ occupancy: { state: "occupied", bookingId: "b", guestName: "A", departAt: "x" } }),
      ).key,
    ).toBe("occupied")
    expect(
      occupancySummary(
        room({ occupancy: { state: "reserved", bookingId: "b", guestName: "A", departAt: "x" } }),
      ).key,
    ).toBe("reserved")
    const dorm = room({
      beds: [
        { id: "1", label: "B1", active: true, occupancy: null },
        {
          id: "2",
          label: "B2",
          active: true,
          occupancy: { state: "occupied", bookingId: "b", guestName: "A", departAt: "x" },
        },
        { id: "3", label: "B3", active: false, occupancy: null },
      ],
    })
    expect(occupancySummary(dorm)).toEqual({ key: "beds", taken: 1, total: 2 })
  })

  it("offers the web's transitions", () => {
    expect(nextStatuses("dirty").map((n) => n.to)).toEqual(["clean", "cleaning"])
    expect(nextStatuses("blocked")).toEqual([{ to: "clean", label: "rooms.unblock" }])
    expect(nextStatuses("clean").map((n) => n.to)).toEqual(["inspected", "dirty"])
  })
})
