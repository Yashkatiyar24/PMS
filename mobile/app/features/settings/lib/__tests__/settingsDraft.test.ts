import type { SettingDef } from "../../types"
import {
  canEdit,
  changedFromDefault,
  effectiveValue,
  intToText,
  parseInt_,
  resetDraft,
  setDraft,
  unitFor,
} from "../settingsDraft"

const def = (over: Partial<SettingDef>): SettingDef => ({
  key: "k",
  group: "g",
  type: "INT",
  defaultValue: 10,
  who: "MANAGER",
  options: null,
  min: 0,
  max: 100,
  maxLength: null,
  description: "",
  ...over,
})

describe("settings draft", () => {
  it("shows draft, then saved, then default", () => {
    const d = def({})
    expect(effectiveValue(d, {}, {})).toBe(10)
    expect(effectiveValue(d, { k: 20 }, {})).toBe(20)
    expect(effectiveValue(d, { k: 20 }, { k: 30 })).toBe(30)
    expect(effectiveValue(d, { k: 20 }, { k: null })).toBe(10)
  })

  it("drops a draft entry that equals the saved value", () => {
    const d = def({})
    expect(setDraft({}, d, { k: 20 }, 25)).toEqual({ k: 25 })
    expect(setDraft({ k: 25 }, d, { k: 20 }, 20)).toEqual({})
    expect(resetDraft({}, d, { k: 20 })).toEqual({ k: null })
    expect(resetDraft({ k: 5 }, d, {})).toEqual({})
  })

  it("counts keys changed from default", () => {
    expect(changedFromDefault([def({ key: "a" }), def({ key: "b" })], { a: 10, b: 11 })).toBe(1)
  })

  it("validates ints and money", () => {
    expect(parseInt_(def({}), "50")).toBe(50)
    expect(parseInt_(def({}), "500")).toBeNull()
    expect(parseInt_(def({ key: "deposit_default_paise", max: 10000000 }), "12.5")).toBe(1250)
    expect(intToText(def({ key: "x_paise" }), 1250)).toBe("12.5")
    expect(unitFor("late_grace_minutes")).toBe("settings.unit.minutes")
    expect(unitFor("online_booking_days_ahead")).toBe("settings.unit.days")
    expect(unitFor("foo")).toBeNull()
  })

  it("gates by who", () => {
    expect(canEdit(def({ who: "MANAGER" }), "MANAGER", false)).toBe(true)
    expect(canEdit(def({ who: "OWNER" }), "MANAGER", false)).toBe(false)
    expect(canEdit(def({ who: "OWNER" }), "OWNER", false)).toBe(true)
    expect(canEdit(def({ who: "SUPER_ADMIN" }), "OWNER", false)).toBe(false)
    expect(canEdit(def({ who: "SUPER_ADMIN" }), null, true)).toBe(true)
  })
})
