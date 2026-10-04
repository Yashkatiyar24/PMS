import { storage } from "@/utils/storage"

import {
  clearFailed,
  enqueue,
  failed,
  flush,
  pending,
  setQueueOwner,
  type QueuedRequest,
} from "../queue"

const entry = (
  id: string,
  path = "/api/bookings/check-in",
): Omit<QueuedRequest, "queuedAt" | "userId" | "propertyId"> => ({
  clientUuid: id,
  method: "POST",
  path,
  body: { clientUuid: id },
})

beforeEach(() => {
  storage.clearAll()
  // the queue store is separate; drain it through the API
  setQueueOwner({ userId: "u1", propertyId: "p1" })
  for (const e of [...pending(), ...failed()]) clearFailed(e.clientUuid)
  setQueueOwner(null)
})

describe("offline queue", () => {
  it("refuses to queue with nobody signed in", () => {
    expect(enqueue(entry("a"))).toBe(false)
  })

  it("scopes entries to the user and property", async () => {
    setQueueOwner({ userId: "u1", propertyId: "p1" })
    expect(enqueue(entry("a"))).toBe(true)
    setQueueOwner({ userId: "u2", propertyId: "p1" })
    expect(pending()).toHaveLength(0)
    setQueueOwner({ userId: "u1", propertyId: "p1" })
    expect(pending().map((e) => e.clientUuid)).toEqual(["a"])
    await flush(async () => ({ ok: true, data: null }))
  })

  it("replays oldest first and drops what was sent", async () => {
    setQueueOwner({ userId: "u1", propertyId: "p1" })
    enqueue(entry("first"))
    enqueue(entry("second"))
    const sent: string[] = []
    const result = await flush(async (e) => {
      sent.push(e.clientUuid)
      return { ok: true, data: null }
    })
    expect(sent).toEqual(["first", "second"])
    expect(result).toEqual({ sent: 2, failed: 0, offline: false })
    expect(pending()).toHaveLength(0)
  })

  it("stops on a network failure and keeps the rest", async () => {
    setQueueOwner({ userId: "u1", propertyId: "p1" })
    enqueue(entry("a"))
    enqueue(entry("b"))
    const result = await flush(async () => ({
      ok: false,
      problem: { kind: "cannot-connect", status: null, message: "", temporary: true },
    }))
    expect(result.offline).toBe(true)
    expect(pending()).toHaveLength(2)
    await flush(async () => ({ ok: true, data: null }))
  })

  it("moves a refused entry to needs attention with the server's words", async () => {
    setQueueOwner({ userId: "u1", propertyId: "p1" })
    enqueue(entry("bad"))
    enqueue(entry("good"))
    const result = await flush(async (e) =>
      e.clientUuid === "bad"
        ? {
            ok: false,
            problem: {
              kind: "conflict",
              status: 409,
              message: "That room is taken",
              temporary: false,
            },
          }
        : { ok: true, data: null },
    )
    expect(result).toEqual({ sent: 1, failed: 1, offline: false })
    expect(failed().map((e) => e.error)).toEqual(["That room is taken"])
    clearFailed("bad")
    expect(failed()).toHaveLength(0)
  })
})
