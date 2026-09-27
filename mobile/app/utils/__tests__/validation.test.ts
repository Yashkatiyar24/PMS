import {
  check,
  emailSchema,
  gstinSchema,
  idLast4Schema,
  looksLikeFullAadhaar,
  moneyTextSchema,
  passwordSchema,
  phoneSchema,
  pinSchema,
  propertyCodeSchema,
  requiredPhoneSchema,
  requiredText,
} from "../validation"

describe("validation utils", () => {
  it("validates phones", () => {
    expect(check(phoneSchema, "").ok).toBe(true)
    expect(check(phoneSchema, "98765 43210").ok).toBe(true)
    expect(check(phoneSchema, "12345").ok).toBe(false)
    expect(check(requiredPhoneSchema, "").ok).toBe(false)
  })

  it("validates emails, text, pins, passwords", () => {
    expect(check(emailSchema, " a@b.co ").ok).toBe(true)
    expect(check(emailSchema, "nope").ok).toBe(false)
    expect(check(requiredText, "  ").ok).toBe(false)
    expect(check(pinSchema, "1234").ok).toBe(true)
    expect(check(pinSchema, "12").ok).toBe(false)
    expect(check(passwordSchema, "short").ok).toBe(false)
    expect(check(passwordSchema, "longenough").ok).toBe(true)
  })

  it("validates ids, money, codes and GSTIN", () => {
    expect(check(idLast4Schema, "1234").ok).toBe(true)
    expect(check(idLast4Schema, "12345").ok).toBe(false)
    expect(check(moneyTextSchema, "1,250.50").ok).toBe(true)
    expect(check(moneyTextSchema, "12.345").ok).toBe(false)
    expect(check(propertyCodeSchema, "").ok).toBe(true)
    expect(check(propertyCodeSchema, "SRD1001").ok).toBe(true)
    expect(check(propertyCodeSchema, "srd").ok).toBe(false)
    expect(check(gstinSchema, "09AAACH7409R1ZZ").ok).toBe(true)
    expect(check(gstinSchema, "short").ok).toBe(false)
  })

  it("returns the first message on failure", () => {
    const result = check(pinSchema, "x")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toBe("validation.pin")
  })

  it("spots a full Aadhaar number", () => {
    expect(looksLikeFullAadhaar("1234 5678 9012")).toBe(true)
    expect(looksLikeFullAadhaar("last 4: 9012")).toBe(false)
  })
})
