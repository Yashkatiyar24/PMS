/**
 * Writes the phone could not send. Only check-ins and folio payments queue (as on the web); each carries a
 * `clientUuid` the server treats as an idempotency key, so a replay creates one record. Entries belong to the
 * user + property that made them and are replayed oldest-first; a 4xx moves an entry to "needs attention".
 */
import type { ApiProblem, ApiResult } from "@/services/api"
import { loadQueue, saveQueue } from "@/utils/storage"

export type QueuedRequest = {
  clientUuid: string
  method: "POST"
  path: string
  body: unknown
  queuedAt: string
  userId: string
  propertyId: string | null
  /** The server's message once it refused the entry. */
  error?: string
}

export type QueueOwner = { userId: string; propertyId: string | null }

const PENDING_KEY = "queue.pending"
const FAILED_KEY = "queue.failed"

let owner: QueueOwner | null = null

export function setQueueOwner(next: QueueOwner | null): void {
  owner = next
}

function all(key: string): QueuedRequest[] {
  return loadQueue<QueuedRequest[]>(key) ?? []
}

function mine(entries: QueuedRequest[]): QueuedRequest[] {
  if (!owner) return []
  return entries.filter((e) => e.userId === owner!.userId && e.propertyId === owner!.propertyId)
}

/** Store a write for later; false when nobody is signed in. */
export function enqueue(entry: Omit<QueuedRequest, "queuedAt" | "userId" | "propertyId">): boolean {
  if (!owner) return false
  const full: QueuedRequest = {
    ...entry,
    queuedAt: new Date().toISOString(),
    userId: owner.userId,
    propertyId: owner.propertyId,
  }
  saveQueue(PENDING_KEY, [
    ...all(PENDING_KEY).filter((e) => e.clientUuid !== entry.clientUuid),
    full,
  ])
  return true
}

export function pending(): QueuedRequest[] {
  return mine(all(PENDING_KEY)).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))
}

export function failed(): QueuedRequest[] {
  return mine(all(FAILED_KEY))
}

export function clearFailed(clientUuid: string): void {
  saveQueue(
    FAILED_KEY,
    all(FAILED_KEY).filter((e) => e.clientUuid !== clientUuid),
  )
}

function removePending(clientUuid: string): void {
  saveQueue(
    PENDING_KEY,
    all(PENDING_KEY).filter((e) => e.clientUuid !== clientUuid),
  )
}

function moveToFailed(entry: QueuedRequest, error: string): void {
  removePending(entry.clientUuid)
  saveQueue(FAILED_KEY, [
    ...all(FAILED_KEY).filter((e) => e.clientUuid !== entry.clientUuid),
    { ...entry, error },
  ])
}

export type FlushResult = { sent: number; failed: number; offline: boolean }
export type Sender = (entry: QueuedRequest) => Promise<ApiResult<unknown>>

/**
 * Replay pending entries in order. Success drops the entry; a 5xx or no network stops (try again later);
 * any other 4xx moves the entry to "needs attention" with the server's words.
 */
export async function flush(send: Sender): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, failed: 0, offline: false }
  for (const entry of pending()) {
    const response = await send(entry)
    if (response.ok) {
      removePending(entry.clientUuid)
      result.sent++
      continue
    }
    if (shouldRetryLater(response.problem)) {
      result.offline = true
      break
    }
    moveToFailed(entry, response.problem.message || "Refused by the server")
    result.failed++
  }
  return result
}

function shouldRetryLater(problem: ApiProblem): boolean {
  return problem.temporary || problem.kind === "unauthorized"
}
