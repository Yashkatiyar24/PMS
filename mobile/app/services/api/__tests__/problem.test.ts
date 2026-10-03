import type { ApiResponse } from "apisauce"

import { isOffline, problemFrom } from "../problem"

const res = (over: Partial<ApiResponse<unknown>>) =>
  ({ ok: false, ...over }) as ApiResponse<unknown>

describe("problemFrom", () => {
  it("maps network failures as temporary", () => {
    expect(problemFrom(res({ problem: "NETWORK_ERROR" }))?.kind).toBe("cannot-connect")
    expect(problemFrom(res({ problem: "TIMEOUT_ERROR" }))?.temporary).toBe(true)
    expect(isOffline(problemFrom(res({ problem: "CONNECTION_ERROR" })))).toBe(true)
  })

  it("keeps the server's message, fields and code", () => {
    const p = problemFrom(
      res({
        problem: "CLIENT_ERROR",
        status: 400,
        data: { error: "Validation failed", fields: { name: "Required" } },
      }),
    )
    expect(p).toMatchObject({
      kind: "rejected",
      status: 400,
      message: "Validation failed",
      fields: { name: "Required" },
    })
    const gate = problemFrom(
      res({
        problem: "CLIENT_ERROR",
        status: 403,
        data: { error: "Set your own password", code: "password_change_required" },
      }),
    )
    expect(gate).toMatchObject({ kind: "forbidden", code: "password_change_required" })
  })

  it("distinguishes 401, 404, 409", () => {
    expect(problemFrom(res({ problem: "CLIENT_ERROR", status: 401 }))?.kind).toBe("unauthorized")
    expect(
      problemFrom(res({ problem: "CLIENT_ERROR", status: 404, data: { error: "Booking" } }))
        ?.message,
    ).toBe("Booking")
    expect(problemFrom(res({ problem: "CLIENT_ERROR", status: 409 }))?.kind).toBe("conflict")
    expect(problemFrom(res({ problem: "SERVER_ERROR", status: 500 }))?.kind).toBe("server")
  })

  it("returns null for ok responses and cancellations", () => {
    expect(problemFrom({ ok: true, problem: null } as ApiResponse<unknown>)).toBeNull()
    expect(problemFrom(res({ problem: "CANCEL_ERROR" }))).toBeNull()
  })
})
