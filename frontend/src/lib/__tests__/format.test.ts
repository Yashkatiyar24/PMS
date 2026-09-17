import { describe, expect, it } from "vitest"
import { rupees, toPaise } from "../format"

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
