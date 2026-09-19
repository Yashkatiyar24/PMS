import { describe, expect, it } from "vitest"
import { dayKey, rupees, toPaise, unitName } from "../format"

describe("dates and units on screen", () => {
  it("keys a day by the local calendar, not the UTC one", () => {
    // Local midnight: in India the UTC day is still the 17th.
    expect(dayKey(new Date(2026, 8, 18, 0, 0))).toBe("2026-09-18")
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05")
  })

  it("names a bed once", () => {
    expect(unitName("101")).toBe("101")
    expect(unitName("D1", "D1-3")).toBe("D1-3")
    expect(unitName("D1", "3")).toBe("D1/3")
  })
})

describe("money on screen", () => {
  it("uses Indian grouping", () => {
    expect(rupees(10000000)).toBe("₹1,00,000")
    expect(rupees(123456789)).toBe("₹12,34,567.89")
  })

  it("reads what the desk types, in rupees", () => {
    expect(toPaise("1500")).toBe(150000)
    expect(toPaise("₹1,500.50")).toBe(150050)
    expect(toPaise("")).toBe(0)
  })

  it("round-trips through paise without drift", () => {
    for (const amount of ["0.01", "99.99", "12345.67"]) {
      expect(toPaise(rupees(toPaise(amount)).replace("₹", ""))).toBe(toPaise(amount))
    }
  })
})
