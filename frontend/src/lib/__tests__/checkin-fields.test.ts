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
    // A reader that barely saw the card. A date it still had to parse is trusted; free text is not.
    dob: { value: "1988-03-14", confidence: 0.22 },
    pincode: { value: "249401", confidence: 0.2 },
    state: { value: "Uttarakhand", confidence: 0.18 },
  }

  it("fills in the empty fields", () => {
    expect(autoFillFromOcr({ name: "", city: undefined }, ocr)).toMatchObject({ name: "Rahul Sharma", city: "Haridwar" })
  })

  it("never overwrites what a person typed", () => {
    const typed: Draft = { name: "Rahul Kumar", city: "" }
    expect(autoFillFromOcr(typed, ocr)).not.toHaveProperty("name")
    expect(autoFillFromOcr(typed, ocr).city).toBe("Haridwar")
  })

  it("will not put barely-read free text into a box", () => {
    // Nothing vouches for a misread name but the reader's own confidence, so a bad one is offered, not written.
    expect(autoFillFromOcr({ state: "" }, ocr)).not.toHaveProperty("state")
  })

  it("does fill a field whose shape it had to match", () => {
    // A date that parsed and six digits of a pincode are their own evidence; the screen still marks them for
    // a glance, because the confidence is what decides that.
    const filled = autoFillFromOcr({ dob: "", pincode: "" }, ocr)
    expect(filled.dob).toBe("1988-03-14")
    expect(filled.pincode).toBe("249401")
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
