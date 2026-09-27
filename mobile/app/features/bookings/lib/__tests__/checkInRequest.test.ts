import type { CheckInForm } from "../../hooks/useCheckInForm"
import { missingStep } from "../../hooks/useCheckInForm"
import { buildCheckInRequest } from "../checkInRequest"

const base: CheckInForm = {
  phone: "+91 98765 43210",
  name: " Asha Devi ",
  guest: null,
  idType: "aadhaar",
  idLast4: "1234",
  address: "Main road",
  city: "Haridwar",
  photo: null,
  skipReason: "",
  adults: 2,
  children: 1,
  nights: 3,
  roomTypeId: "t1",
  unit: { roomId: "r1", bedId: null, ratePaise: null },
  unitLabel: "101",
  advance: "1,500",
  deposit: "500",
  mode: "upi",
  consent: true,
  whatsappOptIn: true,
  registration: null,
}

describe("check-in request", () => {
  it("builds the web's body with paise and a trimmed phone", () => {
    const body = buildCheckInRequest(base, "uuid-1")
    expect(body.newGuest?.phone).toBe("9876543210")
    expect(body.newGuest?.name).toBe("Asha Devi")
    expect(body.advancePaise).toBe(150000)
    expect(body.depositPaise).toBe(50000)
    expect(body.units).toEqual([{ roomId: "r1", bedId: null, ratePaise: null }])
    expect(body.clientUuid).toBe("uuid-1")
    expect(body.idPhotoSkippedReason).toBeNull()
  })

  it("sends the skip reason only when there is no photo at all", () => {
    expect(
      buildCheckInRequest({ ...base, skipReason: "Camera broken" }, "u").idPhotoSkippedReason,
    ).toBe("Camera broken")
    expect(
      buildCheckInRequest(
        { ...base, skipReason: "x", registration: { id: "r", hasIdPhoto: true } },
        "u",
      ).idPhotoSkippedReason,
    ).toBeNull()
  })

  it("reports what is missing in the web's order", () => {
    const rules = { consentRequired: true, photoRequired: true }
    expect(missingStep({ ...base, name: "" }, rules)).toBe("checkin.need.name")
    expect(missingStep({ ...base, unit: null }, rules)).toBe("checkin.need.room")
    expect(missingStep({ ...base, consent: false }, rules)).toBe("checkin.need.consent")
    expect(missingStep(base, rules)).toBe("checkin.need.photo")
    expect(missingStep({ ...base, skipReason: "no camera" }, rules)).toBeNull()
    expect(missingStep(base, { consentRequired: false, photoRequired: false })).toBeNull()
  })
})
