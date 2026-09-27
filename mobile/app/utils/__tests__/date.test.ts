import {
  addDays,
  addMonths,
  ageOf,
  atTime,
  diffInDays,
  formatDate,
  formatDateTime,
  formatTime,
  fromApiDate,
  isToday,
  monthRange,
  nightsBetween,
  parseDate,
  toApiDate,
  today,
  weekStart,
} from "../date"

describe("date utils", () => {
  it("parses ISO datetimes and rejects junk", () => {
    expect(parseDate("2026-09-27T10:00:00+05:30")).toBeInstanceOf(Date)
    expect(parseDate("not a date")).toBeNull()
    expect(parseDate(null)).toBeNull()
  })

  it("formats dd-mm-yyyy and HH:mm", () => {
    const d = new Date(2026, 8, 27, 14, 5)
    expect(formatDate(d)).toBe("27-09-2026")
    expect(formatTime(d)).toBe("14:05")
    expect(formatDateTime(d)).toBe("27-09-2026 14:05")
    expect(formatDate(null)).toBe("")
  })

  it("round-trips API dates in local time", () => {
    expect(toApiDate(new Date(2026, 0, 5))).toBe("2026-01-05")
    expect(fromApiDate("2026-01-05")?.getDate()).toBe(5)
    expect(atTime("2026-01-05", "12:30")?.getHours()).toBe(12)
  })

  it("adds days and months as calendar strings", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28")
  })

  it("counts calendar days and nights", () => {
    expect(diffInDays("2026-01-01", "2026-01-04")).toBe(3)
    expect(diffInDays("2026-01-04", "2026-01-01")).toBe(-3)
    expect(nightsBetween("2026-01-01T12:00:00+05:30", "2026-01-02T10:00:00+05:30")).toBe(1)
    expect(nightsBetween("2026-01-01T12:00:00+05:30", "2026-01-01T18:00:00+05:30")).toBe(1)
  })

  it("knows today", () => {
    expect(isToday(new Date())).toBe(true)
    expect(isToday(addDays(today(), 1))).toBe(false)
  })

  it("finds month and week ranges", () => {
    expect(monthRange("2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" })
    expect(weekStart("2026-09-27")).toBe("2026-09-21")
  })

  it("describes the age of a timestamp", () => {
    expect(ageOf(new Date()).unit).toBe("now")
    expect(ageOf(new Date(Date.now() - 5 * 60000))).toEqual({ unit: "minutes", n: 5 })
    expect(ageOf(new Date(Date.now() - 3 * 3600000)).unit).toBe("hours")
    expect(ageOf(new Date(Date.now() - 2 * 86400000))).toEqual({ unit: "days", n: 2 })
  })
})
