import { toCsv } from "../csv"
import {
  load,
  loadQueue,
  loadSecure,
  remove,
  removeByPrefix,
  save,
  saveQueue,
  saveSecure,
  storage,
} from "../storage"
import { isUuid, newClientUuid } from "../uuid"

describe("uuid", () => {
  it("makes distinct v4 ids", () => {
    const a = newClientUuid()
    const b = newClientUuid()
    expect(isUuid(a)).toBe(true)
    expect(a).not.toBe(b)
    expect(isUuid("nope")).toBe(false)
  })
})

describe("csv", () => {
  it("quotes and guards cells", () => {
    expect(
      toCsv([
        ["a", 1, null],
        ["x,y", 'q"r', "=SUM(1)"],
      ]),
    ).toBe('a,1,\n"x,y","q""r",\'=SUM(1)')
  })
})

describe("storage", () => {
  beforeEach(() => storage.clearAll())

  it("saves and loads JSON", () => {
    save("k", { a: 1 })
    expect(load<{ a: number }>("k")).toEqual({ a: 1 })
    remove("k")
    expect(load("k")).toBeNull()
  })

  it("removes by prefix", () => {
    save("cache.a", 1)
    save("cache.b", 2)
    save("other", 3)
    removeByPrefix("cache.")
    expect(load("cache.a")).toBeNull()
    expect(load("other")).toBe(3)
  })

  it("keeps secure and queue stores apart", () => {
    saveSecure("t", "secret")
    saveQueue("q", [1])
    expect(loadSecure("t")).toBe("secret")
    expect(loadQueue<number[]>("q")).toEqual([1])
    expect(load("t")).toBeNull()
    saveSecure("t", null)
    expect(loadSecure("t")).toBeNull()
  })
})
