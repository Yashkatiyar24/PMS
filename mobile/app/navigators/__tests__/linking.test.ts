import { targetForPath } from "../linking"

jest.mock("expo-linking", () => ({ createURL: () => "padav://" }))
jest.mock("../navigationUtilities", () => ({ navigate: jest.fn() }))

describe("targetForPath", () => {
  it("maps notification links to screens", () => {
    expect(targetForPath("/stays/abc")).toEqual({
      tab: "TodayTab",
      screen: "Stay",
      params: { id: "abc" },
    })
    expect(targetForPath("/rooms")).toEqual({ tab: "RoomsTab", screen: "Rooms" })
    expect(targetForPath("/maintenance/")).toEqual({ tab: "RoomsTab", screen: "Maintenance" })
    expect(targetForPath("https://pms.example.in/inventory?x=1")).toEqual({
      tab: "SettingsTab",
      screen: "Inventory",
    })
    expect(targetForPath("/admin/p1")).toEqual({
      tab: "PlatformTab",
      screen: "PlatformProperty",
      params: { id: "p1" },
    })
    expect(targetForPath("/")).toEqual({ tab: "TodayTab", screen: "Today" })
  })

  it("returns null for unknown paths", () => {
    expect(targetForPath("/nowhere")).toBeNull()
  })
})
