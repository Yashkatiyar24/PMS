import {
  canGrantRole,
  hasAnyPermission,
  hasPermission,
  hasRank,
  homeTab,
  visibleTabs,
} from "../permissions"

const DESK = ["reservations.view", "reservations.create", "checkin", "checkout", "housekeeping"]

describe("permissions utils", () => {
  it("ranks roles", () => {
    expect(hasRank("OWNER", "MANAGER")).toBe(true)
    expect(hasRank("STAFF", "MANAGER")).toBe(false)
    expect(hasRank(null, "LIMITED")).toBe(false)
  })

  it("checks permissions", () => {
    expect(hasPermission(DESK, "checkin")).toBe(true)
    expect(hasPermission(DESK, "refund")).toBe(false)
    expect(hasAnyPermission(["maintenance"], ["housekeeping", "maintenance"])).toBe(true)
    expect(hasPermission(undefined, "checkin")).toBe(false)
  })

  it("lets only owners grant owner/admin", () => {
    expect(canGrantRole("MANAGER", "receptionist")).toBe(true)
    expect(canGrantRole("MANAGER", "owner")).toBe(false)
    expect(canGrantRole("OWNER", "admin")).toBe(true)
    expect(canGrantRole("STAFF", "receptionist")).toBe(false)
  })

  it("mirrors the web's tab list", () => {
    expect(visibleTabs({ permissions: DESK, superAdmin: false, propertyId: "p" })).toEqual([
      "Today",
      "Guests",
      "Bookings",
      "Rooms",
      "Settings",
    ])
    expect(
      visibleTabs({ permissions: ["housekeeping"], superAdmin: false, propertyId: "p" }),
    ).toEqual(["Rooms", "Settings"])
    expect(
      visibleTabs({ permissions: ["revenue.view"], superAdmin: false, propertyId: "p" }),
    ).toEqual(["Reports", "Settings"])
    expect(visibleTabs({ permissions: [], superAdmin: true, propertyId: null })).toEqual([
      "Platform",
    ])
    expect(visibleTabs({ permissions: DESK, superAdmin: true, propertyId: "p" })).toContain(
      "Platform",
    )
  })

  it("picks the landing tab", () => {
    expect(homeTab({ permissions: DESK, superAdmin: false, propertyId: "p" })).toBe("Today")
    expect(homeTab({ permissions: ["maintenance"], superAdmin: false, propertyId: "p" })).toBe(
      "Rooms",
    )
    expect(homeTab({ permissions: [], superAdmin: true, propertyId: null })).toBe("Platform")
  })
})
