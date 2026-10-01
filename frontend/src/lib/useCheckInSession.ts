"use client"

/**
 * One check-in session, two screens.
 *
 * The desk's check-in page and the guest's phone are views of the same row: each one sends the fields its own
 * user changes and reads back the other's, so the register fills in on both screens at once and neither has
 * to be reloaded. All of that lives here, once, with the transport handed in — the desk talks over its signed-in
 * client, the guest's phone over the public one, and neither owns a copy of the logic.
 *
 * The carrier is polling, which is what this backend already had: Spring, no socket server, deployed on a host
 * that scales to several instances. A socket would need infrastructure the project does not run, for a page
 * that is open for ninety seconds at a desk — and the polling would still have to exist as the fallback for a
 * dropped connection, which is the thing most likely to happen on a phone in a lobby. Two seconds is below
 * what reads as "live" to someone watching a screen.
 *
 * Two rules keep the sync from fighting itself:
 *   * a field touched on this screen in the last couple of seconds is not overwritten by what comes back,
 *     so a poll landing mid-word cannot snatch the cursor's value away;
 *   * only fields this user actually changed are sent, so the two sides cannot bounce the same value back and
 *     forth. The version the server returns is adopted as-is, which is how each side recognises its own echo.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import {
  autoFillFromOcr, mergeIncoming,
  type Draft, type FieldName, type Patch, type SessionStatus, type SessionView, type Suggestions,
} from "./checkin-fields"

export type Transport = {
  /** The session as the server holds it, or null when there is nothing to read yet. */
  read: () => Promise<SessionView | null>
  write: (patch: Patch) => Promise<SessionView>
}

/** How often each side asks the other what changed. The desk is watching the screen; this is cheap. */
export const POLL_MS = 2000
/** Text fields are sent this long after the last keystroke, so typing a name is one request, not twenty. */
const DEBOUNCE_MS = 600
/** How long a field this screen just changed is defended against what comes back. */
const GRACE_MS = 2500
/** A change from the other side is highlighted this long, so the user sees what moved. */
const FLASH_MS = 4000

export function useCheckInSession(transport: Transport, options: { enabled?: boolean; pollMs?: number } = {}) {
  const { enabled = true, pollMs = POLL_MS } = options
  // Callers build their transport inline, so it is kept in a ref and refreshed after each render: a stale one
  // would go on talking to a session the screen has already left.
  const io = useRef(transport)

  const [session, setSession] = useState<SessionView | null>(null)
  const [draft, setDraft] = useState<Draft>({})
  const [connected, setConnected] = useState(false)
  /** Fields the other side changed a moment ago, for the "just updated" mark beside them. */
  const [recent, setRecent] = useState<FieldName[]>([])

  const draftRef = useRef<Draft>({})
  const editedAt = useRef<Partial<Record<FieldName, number>>>({})
  const pending = useRef<Patch>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)
  // There is not always a session: self-registration can be switched off for a property, and the desk's form
  // then works exactly as it did before — local state, nothing to sync, nothing to send.
  const on = useRef(enabled)

  useEffect(() => { io.current = transport; on.current = enabled })

  const adopt = useCallback((view: SessionView | null) => {
    setConnected(true)
    if (!view) return
    const { draft: merged, changed } = mergeIncoming(draftRef.current, view.draft ?? {}, editedAt.current, GRACE_MS)
    draftRef.current = merged
    setDraft(merged)
    setSession(view)
    if (changed.length > 0) {
      setRecent(changed)
      setTimeout(() => setRecent((r) => (r === changed ? [] : r)), FLASH_MS)
    }
  }, [])

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const patch = pending.current
    const nothing = !patch.status && !patch.ocr && (!patch.fields || Object.keys(patch.fields).length === 0)
    if (nothing || inFlight.current || !on.current) return
    pending.current = {}
    inFlight.current = true
    try {
      adopt(await io.current.write(patch))
    } catch {
      // Put it back and let the next flush or poll carry it: a field the user typed must not be lost because
      // the lobby's wifi dropped for a second.
      pending.current = { ...patch, ...pending.current, fields: { ...patch.fields, ...pending.current.fields } }
      setConnected(false)
    } finally {
      inFlight.current = false
    }
  }, [adopt])

  const schedule = useCallback((ms = DEBOUNCE_MS) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), ms)
  }, [flush])

  /** One field, as it is typed. Shown immediately, sent shortly. */
  const set = useCallback((field: FieldName, value: Draft[FieldName]) => {
    editedAt.current[field] = Date.now()
    draftRef.current = { ...draftRef.current, [field]: value }
    setDraft(draftRef.current)
    pending.current = { ...pending.current, fields: { ...pending.current.fields, [field]: value } }
    schedule()
  }, [schedule])

  /**
   * Several fields at once — an existing guest picked from a phone lookup, or what a document read.
   * `now` sends them without waiting, which is what an upload, a submission or an ID read deserves.
   */
  const setMany = useCallback((fields: Draft, now = false) => {
    const stamp = Date.now()
    for (const field of Object.keys(fields) as FieldName[]) editedAt.current[field] = stamp
    draftRef.current = { ...draftRef.current, ...fields }
    setDraft(draftRef.current)
    pending.current = { ...pending.current, fields: { ...pending.current.fields, ...fields } }
    if (now) void flush()
    else schedule()
  }, [flush, schedule])

  const setStatus = useCallback((status: SessionStatus) => {
    pending.current = { ...pending.current, status }
    void flush()
  }, [flush])

  /**
   * What reading an ID suggests. Empty fields are filled from it straight away; a field someone already
   * answered keeps their answer and the suggestion is offered beside it.
   */
  const pushOcr = useCallback((ocr: Suggestions) => {
    const fill = autoFillFromOcr(draftRef.current, ocr)
    const stamp = Date.now()
    for (const field of Object.keys(fill) as FieldName[]) editedAt.current[field] = stamp
    draftRef.current = { ...draftRef.current, ...fill }
    setDraft(draftRef.current)
    pending.current = { ...pending.current, ocr, fields: { ...pending.current.fields, ...fill } }
    void flush()
  }, [flush])

  /** The reader's version of a field, taken by a human who looked at it. */
  const accept = useCallback((field: FieldName) => {
    const suggestion = session?.ocr?.[field]
    if (suggestion) set(field, suggestion.value)
  }, [session, set])

  // The other side's work, every couple of seconds. A failed poll only dims the status light; the next one
  // tells the same story, and nothing the user typed depends on it.
  useEffect(() => {
    if (!enabled) return
    let live = true
    void (async () => { try { if (live) adopt(await io.current.read()) } catch { setConnected(false) } })()
    const poll = setInterval(async () => {
      if (!live || inFlight.current) return
      try { adopt(await io.current.read()) } catch { setConnected(false) }
      // A patch stranded by a failed write rides out on the next poll.
      if (Object.keys(pending.current.fields ?? {}).length > 0) void flush()
    }, pollMs)
    return () => { live = false; clearInterval(poll) }
  }, [enabled, pollMs, adopt, flush])

  // Anything typed in the last fraction of a second still goes, even if the tab is closing.
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void flush() } }, [flush])

  return {
    session, draft, connected, recent, flush, set, setMany, setStatus, pushOcr, accept,
    ocr: (session?.ocr ?? {}) as Suggestions,
    status: session?.status ?? ("waiting" as SessionStatus),
    version: session?.version ?? 0,
    /** Replaces the local view wholesale, for a screen that just loaded someone else's record into it. */
    reset: (fields: Draft) => { draftRef.current = fields; setDraft(fields); editedAt.current = {} },
  }
}
