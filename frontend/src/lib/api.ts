/**
 * The only place that talks to the backend.
 *
 * Two rules the whole app depends on:
 *  - every mutating request carries `X-Requested-With: pms`, which is the backend's CSRF check;
 *  - a mutating request that fails because the network is down is handed to the offline queue
 *    instead of being lost, and replayed later with the same client id.
 */
import { enqueue, type QueuedRequest } from "./offline-queue"

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080"

/** Screens reachable without an account; a 401 there must not redirect anywhere. */
export function isPublicScreen(pathname: string): boolean {
  return pathname.startsWith("/login") || pathname.startsWith("/g/") || pathname.startsWith("/book/")
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly fields?: Record<string, string>) {
    super(message)
  }
}

/** Thrown when a write could not reach the server and was stored on the device instead. */
export class QueuedOffline extends Error {
  constructor(readonly clientUuid: string) {
    super("queued-offline")
  }
}

type Options = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  /** Set for writes that may be replayed: the server treats it as an idempotency key. */
  clientUuid?: string
  /** When the network fails, store the request and let the sync worker replay it. */
  queueWhenOffline?: boolean
  signal?: AbortSignal
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const method = options.method ?? "GET"
  const isWrite = method !== "GET"
  const body =
    options.body !== undefined && options.clientUuid
      ? { ...(options.body as object), clientUuid: options.clientUuid }
      : options.body

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: {
        ...(isWrite ? { "X-Requested-With": "pms", "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal,
    })

    // "Signed out" only means something to someone who was signed in. The guest self-registration form
    // under /g/ is opened by a stranger with no account, so bouncing them to a login screen would strand
    // them; those screens use public-api.ts, and this guard is the backstop.
    if (res.status === 401 && typeof window !== "undefined" && !isPublicScreen(window.location.pathname)) {
      window.location.href = "/login"
      throw new ApiError(401, "Signed out")
    }
    if (!res.ok) {
      const problem = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      throw new ApiError(res.status, problem.error ?? `HTTP ${res.status}`, problem.fields)
    }
    if (res.status === 204) return undefined as T
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  } catch (error) {
    // A TypeError from fetch means the request never reached the server: the desk is offline.
    const networkFailure = error instanceof TypeError
    if (networkFailure && isWrite && options.queueWhenOffline && options.clientUuid) {
      const queued: QueuedRequest = {
        clientUuid: options.clientUuid,
        path,
        method,
        body: body ?? null,
        queuedAt: new Date().toISOString(),
      }
      await enqueue(queued)
      throw new QueuedOffline(options.clientUuid)
    }
    throw error
  }
}

/** Multipart upload (ID photos). Never queued: a photo is retaken more easily than replayed. */
export async function upload<T>(path: string, file: Blob, filename: string): Promise<T> {
  const form = new FormData()
  form.append("file", file, filename)
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "X-Requested-With": "pms" },
    body: form,
  })
  if (!res.ok) {
    const problem = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new ApiError(res.status, problem.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const newClientUuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
