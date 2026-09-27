import {
  buildReservation,
  missingForBooking,
  stayWindow,
  type NewBookingForm,
} from "../useNewBookingForm"

const form: NewBookingForm = {
  phone: "9876543210",
  name: "Ravi",
  guest: null,
  arrive: "2026-10-01",
  depart: "2026-10-03",
  roomTypeId: "t1",
  units: [],
  adults: 2,
  children: 0,
  source: "phone",
  groupName: "",
  organization: "",
  gstin: "",
  city: "Delhi",
  requests: "Ground floor",
  tentative: false,
  whatsappOptIn: true,
  advance: "500",
  mode: "upi",
  consent: true,
}

describe("new booking form", () => {
  it("checks in the web's order", () => {
    expect(missingForBooking({ ...form, name: "" }, true)).toBe("checkin.need.name")
    expect(missingForBooking({ ...form, depart: "2026-10-01" }, true)).toBe("booking.need.dates")
    expect(missingForBooking({ ...form, source: "group" }, true)).toBe("booking.need.units")
    expect(
      missingForBooking(
        { ...form, source: "group", units: [{ roomId: "r", bedId: null, ratePaise: null }] },
        true,
      ),
    ).toBe("booking.need.groupName")
    expect(missingForBooking({ ...form, consent: false }, true)).toBe("checkin.need.consent")
    expect(missingForBooking(form, true)).toBeNull()
  })

  it("puts the property's times on the dates", () => {
    const w = stayWindow(form, "12:00", "10:00")
    expect(w?.arriveAt.startsWith("2026-10-01T12:00:00")).toBe(true)
    expect(w?.departAt.startsWith("2026-10-03T10:00:00")).toBe(true)
  })

  it("builds the reservation body", () => {
    const body = buildReservation(form, { arriveAt: "a", departAt: "d" }, "u1")
    expect(body.roomTypeId).toBe("t1")
    expect(body.units).toBeNull()
    expect(body.advancePaise).toBe(50000)
    expect(body.details).toEqual({
      specialRequests: "Ground floor",
      groupName: null,
      organization: null,
      billingGstin: null,
    })
    const corp = buildReservation(
      { ...form, source: "corporate", organization: "Acme", gstin: "09AAACH7409R1ZZ" },
      { arriveAt: "a", departAt: "d" },
      "u",
    )
    expect(corp.details.organization).toBe("Acme")
    expect(corp.details.billingGstin).toBe("09AAACH7409R1ZZ")
  })
})
