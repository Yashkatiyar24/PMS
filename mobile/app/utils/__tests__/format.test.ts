import {
  digitsOnly,
  expandRange,
  formatNumber,
  formatPhone,
  initials,
  paiseToInput,
  percent,
  reference,
  rupees,
  toPaise,
  truncate,
  unitName,
} from "../format"

describe("format utils", () => {
  it("formats paise as rupees with Indian grouping", () => {
    expect(rupees(100000)).toBe("₹1,000")
    expect(rupees(10000000)).toBe("₹1,00,000")
    expect(rupees(125050)).toBe("₹1,250.50")
    expect(rupees(0)).toBe("₹0")
    expect(rupees(null)).toBe("₹0")
  })

  it("converts typed rupees to paise", () => {
    expect(toPaise("1,250.5")).toBe(125050)
    expect(toPaise("")).toBe(0)
    expect(toPaise("abc")).toBe(0)
    expect(toPaise(12.345)).toBe(1235)
    expect(paiseToInput(125050)).toBe("1250.50")
    expect(paiseToInput(100000)).toBe("1000")
    expect(paiseToInput(0)).toBe("")
  })

  it("formats numbers and percents", () => {
    expect(formatNumber(1234567)).toBe("12,34,567")
    expect(percent(63.4)).toBe("63%")
  })

  it("handles phones", () => {
    expect(digitsOnly("+91 98765-43210")).toBe("919876543210")
    expect(formatPhone("9876543210")).toBe("98765 43210")
    expect(formatPhone("+919876543210")).toBe("98765 43210")
    expect(formatPhone("12345")).toBe("12345")
  })

  it("truncates and takes initials", () => {
    expect(truncate("Hello world", 5)).toBe("Hell…")
    expect(truncate("Hi", 5)).toBe("Hi")
    expect(initials("Neeraj Katiyar")).toBe("NK")
    expect(initials("  ")).toBe("")
  })

  it("names units and references like the web", () => {
    expect(unitName("101")).toBe("101")
    expect(unitName("D1", "D1-B3")).toBe("D1-B3")
    expect(unitName("D1", "B3")).toBe("D1/B3")
    expect(reference("6f1a2b3c-aaaa")).toBe("6F1A2B3C")
  })

  it("expands room number ranges", () => {
    expect(expandRange("101-103")).toEqual(["101", "102", "103"])
    expect(expandRange("205")).toEqual(["205"])
    expect(expandRange("110-101")).toEqual([])
  })
})
