import type { ApiResponse } from "apisauce"

import Config from "@/config"

import { ApiClient } from "../client"

/** A response of the shape apisauce hands back, with only the parts the client reads. */
const timedOut = { ok: false, problem: "TIMEOUT_ERROR" } as ApiResponse<unknown>
const refused = {
  ok: false,
  problem: "CLIENT_ERROR",
  status: 400,
  data: { error: "Wrong property code, email or password" },
} as ApiResponse<unknown>
const fine = { ok: true, status: 200, data: { id: "1" } } as ApiResponse<unknown>

/** Stands in for the HTTP layer and records the timeout each attempt was given. */
function stub(client: ApiClient, replies: ApiResponse<unknown>[]) {
  const timeouts: (number | undefined)[] = []
  const send = (_path: string, _a?: unknown, config?: { timeout?: number }) => {
    timeouts.push(config?.timeout)
    return Promise.resolve(replies[Math.min(timeouts.length - 1, replies.length - 1)])
  }
  Object.assign(client.http, { get: send, post: send, put: send, patch: send, delete: send })
  return timeouts
}

describe("a sleeping server", () => {
  it("is given a second, longer chance after a timeout", async () => {
    const client = new ApiClient("https://api.invalid")
    const timeouts = stub(client, [timedOut, fine])

    const result = await client.post("/api/auth/login", { password: "x" })

    expect(result.ok).toBe(true)
    // The first attempt uses the client's own patience; the retry uses a waking server's.
    expect(timeouts).toEqual([undefined, Config.API_COLD_START_TIMEOUT_MS])
  })

  it("gives up after the second attempt rather than hammering", async () => {
    const client = new ApiClient("https://api.invalid")
    const timeouts = stub(client, [timedOut, timedOut, fine])

    const result = await client.get("/api/auth/me")

    expect(result.ok).toBe(false)
    expect(timeouts).toHaveLength(2)
  })
})

describe("an answer from the server", () => {
  it("is never retried, however unwelcome", async () => {
    // A wrong password is an answer, not a failure to reach anybody: asking twice would only slow the screen
    // down and, for a write, could repeat it.
    const client = new ApiClient("https://api.invalid")
    const timeouts = stub(client, [refused, fine])

    const result = await client.post("/api/auth/login", { password: "wrong" })

    expect(result.ok).toBe(false)
    expect(timeouts).toHaveLength(1)
    if (!result.ok) expect(result.problem.message).toContain("Wrong property code")
  })
})
