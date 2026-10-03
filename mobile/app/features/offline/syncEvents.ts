/** A tiny event bus between the queue, the OfflineBar and screens that reload after a sync. */
type Events = {
  queued: string
  syncing: boolean
  synced: number
  counts: { pending: number; failed: number }
}

type Listener<K extends keyof Events> = (payload: Events[K]) => void

type AnyListener = (payload: Events[keyof Events]) => void
const listeners = new Map<keyof Events, Set<AnyListener>>()

function setFor(event: keyof Events): Set<AnyListener> {
  let set = listeners.get(event)
  if (!set) {
    set = new Set()
    listeners.set(event, set)
  }
  return set
}

export const syncEvents = {
  on<K extends keyof Events>(event: K, listener: Listener<K>): () => void {
    const set = setFor(event)
    const wrapped = listener as AnyListener
    set.add(wrapped)
    return () => {
      set.delete(wrapped)
    }
  },
  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    setFor(event).forEach((l) => l(payload))
  },
}
