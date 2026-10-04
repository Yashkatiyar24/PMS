import { NotificationStore } from "../NotificationStore"

const feed = {
  items: [
    {
      id: "1",
      kind: "check_in",
      title: "Checked in",
      body: "101",
      link: "/stays/a",
      createdAt: "2026-09-27T10:00:00+05:30",
      unread: true,
    },
    {
      id: "2",
      kind: "low_stock",
      title: "Low stock",
      body: "",
      link: "/inventory",
      createdAt: "2026-09-27T09:00:00+05:30",
      unread: false,
    },
  ],
  unread: 1,
}

function make(over: Record<string, jest.Mock> = {}) {
  const notifications = {
    feed: jest.fn(async () => ({ ok: true, data: feed })),
    markSeen: jest.fn(async () => ({ ok: true })),
    registerPushToken: jest.fn(async () => ({ ok: true })),
    ...over,
  }
  return { store: NotificationStore.create({}, { api: { notifications } }), api: notifications }
}

describe("NotificationStore", () => {
  it("loads the feed and unread count", async () => {
    const { store } = make()
    expect(await store.load()).toBe(true)
    expect(store.items).toHaveLength(2)
    expect(store.unread).toBe(1)
    expect(store.loading).toBe(false)
  })

  it("keeps the problem when loading fails", async () => {
    const { store } = make({
      feed: jest.fn(async () => ({
        ok: false,
        problem: { kind: "server", status: 500, message: "down", temporary: true },
      })),
    })
    expect(await store.load()).toBe(false)
    expect(store.problem?.message).toBe("down")
  })

  it("marks seen optimistically and tells the server once", async () => {
    const { store, api } = make()
    await store.load()
    await store.markSeen()
    expect(store.unread).toBe(0)
    expect(store.items.every((i) => !i.unread)).toBe(true)
    expect(api.markSeen).toHaveBeenCalledTimes(1)
    await store.markSeen()
    expect(api.markSeen).toHaveBeenCalledTimes(1)
  })

  it("registers a push token only when it changes", async () => {
    const { store, api } = make()
    await store.registerPushToken("t1", "android")
    await store.registerPushToken("t1", "android")
    await store.registerPushToken("t2", "android")
    expect(api.registerPushToken).toHaveBeenCalledTimes(2)
    expect(api.registerPushToken).toHaveBeenLastCalledWith({ token: "t2", platform: "android" })
    store.reset()
    expect(store.registeredToken).toBeNull()
  })
})
