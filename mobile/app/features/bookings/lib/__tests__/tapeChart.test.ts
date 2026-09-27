import type { TapeChart } from "../../types"
import { chartDays, dayLoad, groupLanes, placeBar } from "../tapeChart"

const chart: TapeChart = {
  start: "2026-10-01",
  days: 4,
  units: [
    {
      room_id: "r1",
      number: "101",
      floor: 1,
      status: "clean",
      blocked_reason: null,
      type_name: "AC",
      is_dormitory: false,
      bed_id: null,
      label: null,
    },
    {
      room_id: "r2",
      number: "102",
      floor: 1,
      status: "blocked",
      blocked_reason: "paint",
      type_name: "AC",
      is_dormitory: false,
      bed_id: null,
      label: null,
    },
    {
      room_id: "d1",
      number: "D1",
      floor: 0,
      status: "clean",
      blocked_reason: null,
      type_name: "Dorm",
      is_dormitory: true,
      bed_id: "b1",
      label: "B1",
    },
  ],
  occupancy: [
    {
      unit_id: "r1",
      room_id: "r1",
      bed_id: null,
      arrive_at: "2026-10-01T12:00:00+05:30",
      depart_at: "2026-10-03T10:00:00+05:30",
      booking_id: "bk1",
      state: "checked_in",
      source: "phone",
      guest_name: "Asha",
    },
    {
      unit_id: "b1",
      room_id: "d1",
      bed_id: "b1",
      arrive_at: "2026-09-29T12:00:00+05:30",
      depart_at: "2026-10-02T10:00:00+05:30",
      booking_id: "bk2",
      state: "reserved",
      source: "ota",
      guest_name: "Ravi",
    },
    {
      unit_id: "b1",
      room_id: "d1",
      bed_id: "b1",
      arrive_at: "2026-10-10T12:00:00+05:30",
      depart_at: "2026-10-12T10:00:00+05:30",
      booking_id: "bk3",
      state: "reserved",
      source: "phone",
      guest_name: "Later",
    },
  ],
}

describe("tape chart", () => {
  it("lists the days", () => {
    expect(chartDays(chart)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"])
  })

  it("places bars by day index and clips to the chart", () => {
    expect(placeBar(chart, chart.occupancy[0])).toMatchObject({ from: 0, to: 2 })
    expect(placeBar(chart, chart.occupancy[1])).toMatchObject({ from: 0, to: 1 })
    expect(placeBar(chart, chart.occupancy[2])).toBeNull()
  })

  it("groups private rooms before dormitories and labels beds", () => {
    const groups = groupLanes(chart)
    expect(groups.map((g) => g.type)).toEqual(["AC", "Dorm"])
    expect(groups[1].lanes[0].label).toBe("D1/B1")
    expect(groups[0].lanes[1].offSale).toBe(true)
    expect(groups[0].lanes[0].bars).toHaveLength(1)
  })

  it("counts busy and free per day ignoring off-sale units", () => {
    const load = dayLoad(chart, groupLanes(chart))
    expect(load[0]).toEqual({ busy: 2, free: 0, pct: 100 })
    expect(load[1]).toEqual({ busy: 1, free: 1, pct: 50 })
    expect(load[3]).toEqual({ busy: 0, free: 2, pct: 0 })
  })
})
