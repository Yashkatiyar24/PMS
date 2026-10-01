import { describe, expect, it } from "vitest"
import { extractId, isoDate, parseDocument } from "../ocr"

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

describe("reading the fields off an identity document", () => {
  const aadhaar = [
    "भारत सरकार",
    "Government of India",
    "Rahul Sharma",
    "DOB: 14/03/1988",
    "Male",
    "1234 5678 9012",
    "Address: 12 Temple Road, Haridwar, Uttarakhand - 249401",
  ].join("\n")

  it("maps an Aadhaar card onto the register's own fields", () => {
    const read = parseDocument(aadhaar, 0.9)
    expect(read._doc).toBe("aadhaar")
    expect(read.idType?.value).toBe("aadhaar")
    expect(read.name?.value).toBe("Rahul Sharma")
    expect(read.dob?.value).toBe("1988-03-14")
    expect(read.gender?.value).toBe("male")
    expect(read.state?.value).toBe("Uttarakhand")
    expect(read.pincode?.value).toBe("249401")
  })

  it("keeps only the last four digits of the number, never the number", () => {
    const read = parseDocument(aadhaar)
    expect(read.idLast4?.value).toBe("9012")
    expect(JSON.stringify(read)).not.toContain("123456789012")
    expect(JSON.stringify(read)).not.toContain("1234 5678 9012")
  })

  it("reads a PAN card, which has no address or gender to give", () => {
    const read = parseDocument("INCOME TAX DEPARTMENT\nGOVT OF INDIA\nName\nSUNIL KUMAR\nABCDE1234F\n01/01/1990")
    expect(read._doc).toBe("pan")
    expect(read.idType?.value).toBe("pan")
    expect(read.name?.value).toBe("SUNIL KUMAR")
    expect(read.idLast4?.value).toBe("234F")
    expect(read.address).toBeUndefined()
    expect(read.gender).toBeUndefined()
  })

  it("reads a voter card by its EPIC number", () => {
    const read = parseDocument("ELECTION COMMISSION OF INDIA\nElector's Name: Meena Devi\nABC1234567")
    expect(read._doc).toBe("voter")
    expect(read.idType?.value).toBe("voter")
    expect(read.name?.value).toBe("Meena Devi")
    expect(read.idLast4?.value).toBe("4567")
  })

  it("reads a passport and the nationality printed on it", () => {
    const read = parseDocument("REPUBLIC OF INDIA\nPASSPORT\nName: Arjun Rao\nINDIAN\nZ1234567\n02/02/1980")
    expect(read._doc).toBe("passport")
    expect(read.idType?.value).toBe("passport")
    expect(read.nationality?.value).toBe("IN")
    expect(read.idLast4?.value).toBe("4567")
  })

  it("trusts a labelled field more than one found by where it sits", () => {
    const labelled = parseDocument("Name: Rahul Sharma\nDOB 14/03/1988", 0.9)
    const positional = parseDocument("Rahul Sharma\nDOB 14/03/1988", 0.9)
    expect(labelled.name!.confidence).toBeGreaterThan(positional.name!.confidence)
  })

  it("gives nothing it cannot find rather than a blank somebody has to notice", () => {
    const read = parseDocument("ELECTION COMMISSION OF INDIA")
    expect(read.dob).toBeUndefined()
    expect(read.pincode).toBeUndefined()
    expect(read.city).toBeUndefined()
  })

  it("will not take a year printed on its own as a date of birth", () => {
    expect(isoDate("YOB 1988")).toBeNull()
    expect(isoDate("DOB 31/13/1988")).toBeNull()
    expect(isoDate("DOB 1.2.1988")).toBe("1988-02-01")
  })
})
