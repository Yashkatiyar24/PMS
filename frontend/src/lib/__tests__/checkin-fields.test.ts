import { describe, expect, it } from "vitest"
import { autoFillFromOcr, mergeIncoming, openSuggestions, toGuestInput, type Draft } from "../checkin-fields"

describe("two screens on one check-in session", () => {
  it("takes the other side's value for a field nobody here is typing in", () => {
    const { draft, changed } = mergeIncoming({ name: "" }, { name: "Rahul Sharma" }, {})
    expect(draft.name).toBe("Rahul Sharma")
    expect(changed).toEqual(["name"])
  })

  it("does not snatch a field away from the person typing in it", () => {
    const now = Date.now()
    const { draft, changed } = mergeIncoming({ name: "Rahul Kum" }, { name: "Rahul Sharma" }, { name: now - 200 }, 2500, now)
    expect(draft.name).toBe("Rahul Kum")
    expect(changed).toEqual([])
  })

  it("accepts the other side once the typing has stopped", () => {
    const now = Date.now()
    const { draft } = mergeIncoming({ name: "Rahul Kum" }, { name: "Rahul Sharma" }, { name: now - 9000 }, 2500, now)
    expect(draft.name).toBe("Rahul Sharma")
  })

  it("reports no change when the value coming back is the one already shown", () => {
    const { changed } = mergeIncoming({ city: "Delhi", members: [{ name: "Sita", adult: true }] },
      { city: "Delhi", members: [{ name: "Sita", adult: true }] }, {})
    expect(changed).toEqual([])
  })
})

describe("what a document read is allowed to do", () => {
  const ocr = {
    name: { value: "Rahul Sharma", confidence: 0.96 },
    city: { value: "Haridwar", confidence: 0.8 },
    state: { value: "Uttarakhand", confidence: 0.4 },
  }

  it("fills in the empty fields", () => {
    expect(autoFillFromOcr({ name: "", city: undefined }, ocr)).toEqual({ name: "Rahul Sharma", city: "Haridwar" })
  })

  it("never overwrites what a person typed", () => {
    const typed: Draft = { name: "Rahul Kumar", city: "" }
    expect(autoFillFromOcr(typed, ocr)).toEqual({ city: "Haridwar" })
  })

  it("leaves a field alone when it is barely readable", () => {
    expect(autoFillFromOcr({ state: "" }, ocr)).not.toHaveProperty("state")
  })

  it("offers the reader's version of a field somebody already answered", () => {
    expect(openSuggestions({ name: "Rahul Kumar", city: "Haridwar" }, ocr))
      .toEqual([{ field: "name", suggestion: ocr.name }])
  })
})

describe("the draft as the guest record wants it", () => {
  it("sends blanks as nulls where the register expects a missing value", () => {
    expect(toGuestInput({ name: " Rahul Sharma ", phone: "9876543210" })).toMatchObject({
      name: "Rahul Sharma", phone: "9876543210", nationality: "IN", idType: null, idLast4: null, email: null,
    })
  })
})
