/**
 * Client-generated ids: the server treats `clientUuid` as an idempotency key, so a queued write replayed twice
 * creates one record. Uses the runtime's `crypto.randomUUID` when present, else a Math.random v4.
 */
export function newClientUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** True for the 8-4-4-4-12 hex shape. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
