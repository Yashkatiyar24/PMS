import type { ApiResponse } from "apisauce"

/**
 * Why a call failed, in the client's words. `message` is what the desk reads (the server's `error` text when
 * there is one), `fields` the per-field validation messages, `code` the server's machine code when it sends one.
 */
export type ApiProblemKind =
  | "timeout"
  | "cannot-connect"
  | "server"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "rejected"
  | "unknown"
  | "bad-data"

export type ApiProblem = {
  kind: ApiProblemKind
  status: number | null
  message: string
  fields?: Record<string, string>
  code?: string
  /** True when trying again later may work (no network, timeout, 5xx). */
  temporary: boolean
}

type ErrorBody = { error?: string; fields?: Record<string, string>; code?: string }

/** Map an apisauce response to a problem; null when the response was fine. */
export function problemFrom(response: ApiResponse<unknown>): ApiProblem | null {
  if (response.ok) return null
  const body = (response.data ?? {}) as ErrorBody
  const status = response.status ?? null
  const serverMessage = typeof body.error === "string" ? body.error : ""
  const base = { status, message: serverMessage, fields: body.fields, code: body.code }

  switch (response.problem) {
    case "CONNECTION_ERROR":
    case "NETWORK_ERROR":
      return { ...base, kind: "cannot-connect", temporary: true }
    case "TIMEOUT_ERROR":
      return { ...base, kind: "timeout", temporary: true }
    case "SERVER_ERROR":
      return {
        ...base,
        kind: "server",
        temporary: true,
        message: serverMessage || "Something went wrong",
      }
    case "CLIENT_ERROR":
      return {
        ...base,
        kind: kindForStatus(status),
        temporary: false,
        message: serverMessage || `HTTP ${status}`,
      }
    case "CANCEL_ERROR":
      return null
    default:
      return { ...base, kind: "unknown", temporary: true }
  }
}

function kindForStatus(status: number | null): ApiProblemKind {
  switch (status) {
    case 401:
      return "unauthorized"
    case 403:
      return "forbidden"
    case 404:
      return "not-found"
    case 409:
      return "conflict"
    default:
      return "rejected"
  }
}

/** A problem the client made itself (a response that did not parse). */
export function badData(message = "Unexpected response"): ApiProblem {
  return { kind: "bad-data", status: null, message, temporary: false }
}

/** True when the request never reached the server: the phone is offline. */
export function isOffline(problem: ApiProblem | null | undefined): boolean {
  return problem?.kind === "cannot-connect" || problem?.kind === "timeout"
}
