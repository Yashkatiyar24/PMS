import { describe, expect, it } from "vitest"
import { extractId } from "../ocr"

describe("reading an ID number out of OCR text", () => {
  it("reads an Aadhaar printed in groups of four", () => {
    expect(extractId("Government of India\n1234 5678 9012\nDOB 01/01/1990")).toEqual({ idType: "aadhaar", idLast4: "9012" })
  })

  it("reads an Aadhaar printed without spaces", () => {
    expect(extractId("123456789012")).toEqual({ idType: "aadhaar", idLast4: "9012" })
  })

  it("prefers the Aadhaar over the longer VID on the same card", () => {
    expect(extractId("VID 1234 5678 9012 3456\nAadhaar 9876 5432 1098")).toEqual({ idType: "aadhaar", idLast4: "1098" })
  })

  it("takes the longest run from a non-Aadhaar document", () => {
    expect(extractId("EPIC ABC1234567 issued 2019")).toEqual({ idType: null, idLast4: "4567" })
  })

  it("does not join digits across lines", () => {
    // Two unrelated short numbers on separate lines never merge into a fake Aadhaar.
    expect(extractId("123456\n789012")).toEqual({ idType: null, idLast4: "3456" })
  })

  it("gives nothing when there is no number to read", () => {
    expect(extractId("ELECTION COMMISSION OF INDIA")).toBeNull()
    expect(extractId("pin 1234")).toBeNull()
  })
})
