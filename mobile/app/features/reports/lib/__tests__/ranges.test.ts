import { rangeFor } from "../ranges"

describe("report ranges", () => {
  const now = "2026-09-27" // a Sunday
  it("computes presets on calendar days", () => {
    expect(rangeFor("today", now)).toEqual({ from: "2026-09-27", to: "2026-09-27" })
    expect(rangeFor("yesterday", now)).toEqual({ from: "2026-09-26", to: "2026-09-26" })
    expect(rangeFor("week", now)).toEqual({ from: "2026-09-21", to: "2026-09-27" })
    expect(rangeFor("month", now)).toEqual({ from: "2026-09-01", to: "2026-09-27" })
    expect(rangeFor("lastMonth", now)).toEqual({ from: "2026-08-01", to: "2026-08-31" })
  })
})
