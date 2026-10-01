import { describe, expect, it } from "vitest"
import { dayKey, phoneDigits, rupees, toPaise, unitName } from "../format"

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

describe("a mobile number, however it was typed or pasted", () => {
  it("keeps ten digits and no more", () => {
    expect(phoneDigits("9876543210")).toBe("9876543210")
    expect(phoneDigits("98765432109999")).toBe("9876543210")
  })

  it("throws away everything that is not a digit", () => {
    expect(phoneDigits("98765 43210")).toBe("9876543210")
    expect(phoneDigits("(987) 654-3210")).toBe("9876543210")
  })

  it("drops a country code or a trunk zero in front of a full number", () => {
    expect(phoneDigits("+91 98765 43210")).toBe("9876543210")
    expect(phoneDigits("919876543210")).toBe("9876543210")
    expect(phoneDigits("09876543210")).toBe("9876543210")
    expect(phoneDigits("+91 098765 43210")).toBe("9876543210")
  })

  it("leaves a real number that happens to start 91 alone", () => {
    // 9123456789 is somebody's mobile, not 91 followed by eight digits.
    expect(phoneDigits("9123456789")).toBe("9123456789")
  })

  it("leaves a half-typed number half-typed", () => {
    // The desk looks a guest up on the last few digits, so a short number is not padded or refused.
    expect(phoneDigits("98765")).toBe("98765")
    expect(phoneDigits("")).toBe("")
  })
})
