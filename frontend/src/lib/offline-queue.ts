/**
 * Writes the desk made while offline, stored on the device until they reach the server.
 *
 * The desk's network drops constantly, so a check-in must never depend on it. Each queued write carries a
 * client-generated id that the backend treats as an idempotency key, which makes replaying safe: sending the
 * same entry twice creates one booking. Entries are replayed in the order they were made, because a payment
 * must not arrive before the check-in it belongs to.
 *
 * Anything the server rejects for a real reason (the bed was taken meanwhile) moves to "needs attention"
 * rather than being dropped, so the desk always finds out.
 *
 * Every entry is stamped with who queued it and at which property, and is only listed and replayed for that
 * same person at that same property. A phone handed to a colleague, or switched to another property, never
 * sends someone else's check-ins under the new session.
 */
const DB_NAME = "pms-offline"
const DB_VERSION = 1
const QUEUE = "queue"
const FAILED = "failed"

export type QueuedRequest = {
  clientUuid: string
  path: string
  method: string
  body: unknown
  queuedAt: string
  /** Who queued it, and where; set by enqueue from the current session. */
  userId?: string
  propertyId?: string | null
  /** Set when the server rejected it; the entry moves to the failed store for the desk to resolve. */
  error?: string
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: "clientUuid" })
      if (!db.objectStoreNames.contains(FAILED)) db.createObjectStore(FAILED, { keyPath: "clientUuid" })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(store: string, mode: IDBTransactionMode, body: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const request = body(tx.objectStore(store))
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

export type QueueOwner = { userId: string; propertyId: string | null }
let currentOwner: QueueOwner | null = null

/** The session provider tells the queue who is signed in; nothing is queued, listed or sent for nobody. */
export const setQueueOwner = (owner: QueueOwner | null) => { currentOwner = owner }

const mine = (e: QueuedRequest) => !!currentOwner && e.userId === currentOwner.userId && (e.propertyId ?? null) === currentOwner.propertyId

export const enqueue = (entry: QueuedRequest) => {
  if (!currentOwner) return Promise.reject(new Error("no-session"))
  return withStore<void>(QUEUE, "readwrite", (s) => s.put({ ...entry, userId: currentOwner!.userId, propertyId: currentOwner!.propertyId }))
}
export const pending = async () => (await withStore<QueuedRequest[]>(QUEUE, "readonly", (s) => s.getAll())).filter(mine)
export const failed = async () => (await withStore<QueuedRequest[]>(FAILED, "readonly", (s) => s.getAll())).filter(mine)
export const remove = (clientUuid: string) => withStore<void>(QUEUE, "readwrite", (s) => s.delete(clientUuid))
export const clearFailed = (clientUuid: string) => withStore<void>(FAILED, "readwrite", (s) => s.delete(clientUuid))

async function moveToFailed(entry: QueuedRequest, error: string) {
  await withStore<void>(FAILED, "readwrite", (s) => s.put({ ...entry, error }))
  await remove(entry.clientUuid)
}

/**
 * Replay everything, oldest first. Returns what happened so the UI can tell the desk.
 * Stops at the first network failure: the desk is still offline and the rest must keep their order.
 */
export async function flush(base: string): Promise<{ sent: number; failed: number; offline: boolean }> {
  const entries = (await pending()).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))
  let sent = 0
  let rejected = 0

  for (const entry of entries) {
    try {
      const res = await fetch(`${base}${entry.path}`, {
        method: entry.method,
        credentials: "include",
        headers: { "X-Requested-With": "pms", "Content-Type": "application/json" },
        body: entry.body === null ? undefined : JSON.stringify(entry.body),
      })
      if (res.ok) {
        await remove(entry.clientUuid)
        sent++
      } else if (res.status >= 500) {
        return { sent, failed: rejected, offline: true } // the server is unwell; try again later
      } else {
        const problem = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        await moveToFailed(entry, problem.error ?? `HTTP ${res.status}`)
        rejected++
      }
    } catch {
      return { sent, failed: rejected, offline: true }
    }
  }
  return { sent, failed: rejected, offline: false }
}
