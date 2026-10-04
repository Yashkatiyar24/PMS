import { extractTextFromImage } from "expo-text-extractor"

import { canReadText, extractId, readIdFromPhoto } from "../ocr"

jest.mock("expo-text-extractor", () => ({
  isSupported: true,
  extractTextFromImage: jest.fn(),
}))

const mockExtract = extractTextFromImage as jest.Mock

describe("extractId", () => {
  it("reads an Aadhaar printed 4-4-4 and keeps only the last four", () => {
    expect(
      extractId("Government of India\nDOB 01/01/1990\n1234 5678 9012\nVID 9999 8888 7777 6666"),
    ).toEqual({
      idType: "aadhaar",
      idLast4: "9012",
    })
  })

  it("takes the longest run of six or more when there is no 12-digit run", () => {
    expect(extractId("DL No 0420110149646\nIssued 123456")).toEqual({
      idType: null,
      idLast4: "9646",
    })
  })

  it("does not join digits across lines", () => {
    expect(extractId("123456\n789012")).toEqual({ idType: null, idLast4: "3456" })
  })

  it("returns null when nothing looks like a number", () => {
    expect(extractId("ELECTION COMMISSION\n12/05")).toBeNull()
    expect(extractId("")).toBeNull()
  })
})

describe("readIdFromPhoto", () => {
  beforeEach(() => mockExtract.mockReset())

  it("reports support", () => {
    expect(canReadText()).toBe(true)
  })

  it("joins the recognised lines and extracts the ID", async () => {
    mockExtract.mockResolvedValue(["UNIQUE IDENTIFICATION", "4321 8765 2109"])
    expect(await readIdFromPhoto("file:///id.jpg")).toEqual({ idType: "aadhaar", idLast4: "2109" })
    expect(mockExtract).toHaveBeenCalledWith("file:///id.jpg")
  })

  it("returns null when the recogniser fails", async () => {
    mockExtract.mockRejectedValue(new Error("no model"))
    expect(await readIdFromPhoto("file:///id.jpg")).toBeNull()
  })

  it("gives up after the timeout", async () => {
    mockExtract.mockReturnValue(new Promise(() => undefined))
    expect(await readIdFromPhoto("file:///id.jpg", 10)).toBeNull()
  })
})
