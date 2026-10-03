/**
 * The one list of questions a check-in asks, and the rules for merging two people answering them at once.
 *
 * The desk's screen (`/check-in`), the guest's phone (`/g/[token]`) and the document reader (`ocr.ts`) all
 * read and write the same draft on the same check-in session, so they all name their fields from here. The
 * backend's copy of this list is `CheckInFields.java`, and a backend test fails if the two drift apart.
 *
 * Nothing here holds a full document number: the register keeps the last four digits, and both ends refuse
 * text containing a twelve-digit run.
 */

/** Every field of a check-in draft, in the order the screens ask them. */
export const FIELDS = [
  "name", "phone", "email", "dob", "gender", "address", "city",
  "state", "pincode", "country", "nationality", "idType", "idLast4", "passportNo",
  "adults", "children", "purpose", "members", "consent", "whatsappOptIn",
] as const

export type FieldName = (typeof FIELDS)[number]

export type Member = { name: string; adult: boolean }
export type FieldValue = string | number | boolean | Member[] | undefined
export type Draft = Partial<Record<FieldName, FieldValue>>

/** What reading a document suggests for one field, and how much the reader trusts it. */
export type Suggestion = { value: string; confidence: number }
/** Suggestions by field, plus `_doc`: which kind of document was recognised. */
export type Suggestions = Partial<Record<FieldName, Suggestion>> & { _doc?: string }

/** How far along the guest is. Drives the status line on the desk's screen. */
export type SessionStatus = "waiting" | "opened" | "filling" | "reading_id" | "submitted"

/** The shared check-in session, as both screens read it. */
export type SessionView = {
  state: "open" | "submitted" | "applied" | "revoked"
  status: SessionStatus
  /** Bumped on every write. Each side keeps the last one it saw, so it can ignore its own echo. */
  version: number
  draft: Draft
  ocr: Suggestions
  hasIdPhoto: boolean
  expiresAt: string
}

export type Patch = { fields?: Draft; ocr?: Suggestions; status?: SessionStatus }

export const ID_TYPES = ["aadhaar", "voter", "dl", "passport", "pan", "other"] as const

/** The fields the guest answers about themselves; the rest (room, money) never leave the desk. */
export const GUEST_FIELDS: FieldName[] = [...FIELDS]

const same = (a: FieldValue, b: FieldValue) =>
  Array.isArray(a) || Array.isArray(b) ? JSON.stringify(a ?? []) === JSON.stringify(b ?? []) : (a ?? "") === (b ?? "")

/**
 * Fold the session's draft into what is on screen, field by field.
 *
 * A field the person in front of this screen touched within `graceMs` is left as they typed it: without that
 * window, a poll landing mid-word would snatch the cursor's value back to whatever the server last heard.
 * Everything else takes the server's value, which is how one side sees the other's work.
 *
 * @param editedAt when each field was last changed locally, by field name
 * @returns the merged view, and which fields the incoming draft actually changed (for an "updated" flash)
 */
export function mergeIncoming(
  local: Draft,
  incoming: Draft,
  editedAt: Partial<Record<FieldName, number>>,
  graceMs = 2500,
  now = Date.now(),
): { draft: Draft; changed: FieldName[] } {
  const merged: Draft = { ...local }
  const changed: FieldName[] = []
  for (const field of FIELDS) {
    if (!(field in incoming)) continue
    const mine = local[field]
    const theirs = incoming[field]
    if (same(mine, theirs)) continue
    const edited = editedAt[field] ?? 0
    if (now - edited < graceMs) continue // still being typed here; this screen wins until they stop
    merged[field] = theirs
    changed.push(field)
  }
  return { draft: merged, changed }
}

/**
 * What a document read may be written straight into: only the fields nobody has filled in yet.
 *
 * A name or an address someone typed is never replaced by the reader's version — that is the one way this
 * feature could destroy real information. The rest stay as suggestions beside the field, for a human to take
 * or ignore.
 */
export function autoFillFromOcr(draft: Draft, ocr: Suggestions, minConfidence = MIN_FILL_CONFIDENCE): Draft {
  const fill: Draft = {}
  for (const field of FIELDS) {
    const suggestion = ocr[field]
    if (!suggestion) continue
    // A field whose shape the reader had to match to produce it at all — a real date, six digits of pincode,
    // four of a document number, one of the ID types we know — is filled in whatever the reader thought of
    // the photograph: the structure is the evidence. A card read in a dim lobby reports a confidence around
    // 0.3 and still gives the right date, and leaving that out of the form was costing more than it saved.
    // Free text (a name, an address) still has to clear the bar, because nothing but confidence vouches for it.
    if (!VERIFIED_BY_SHAPE.includes(field) && suggestion.confidence < minConfidence) continue
    const current = draft[field]
    if (current !== undefined && current !== "" && current !== null) continue
    fill[field] = suggestion.value
  }
  return fill
}

/** Fields where the reader's suggestion differs from what is in the draft: shown as "use this instead". */
export function openSuggestions(draft: Draft, ocr: Suggestions): { field: FieldName; suggestion: Suggestion }[] {
  return FIELDS.flatMap((field) => {
    const suggestion = ocr[field]
    if (!suggestion) return []
    const current = draft[field]
    return current !== undefined && current !== "" && String(current) !== suggestion.value ? [{ field, suggestion }] : []
  })
}

/**
 * The bar free text has to clear to be written into an empty box.
 *
 * Deliberately low, and measured: a card photographed in a lobby comes back between 0.4 and 0.5 with the name
 * right, and a name found by its position on the card is discounted again on top of that.
 * Leaving the box empty does not save anybody from a bad read — they retype the name either way — while a
 * filled box marked "please check" (anything under {@link LOW_CONFIDENCE}) gets glanced at and corrected in
 * one tap. Nothing is ever written over something a person typed, which is what makes a low bar safe here.
 */
const MIN_FILL_CONFIDENCE = 0.35

/**
 * Fields the parser can only produce by matching a shape, so a low confidence does not make them doubtful in
 * the way a badly-read name is. They are filled in and flagged for a glance, not withheld.
 */
const VERIFIED_BY_SHAPE: FieldName[] = ["dob", "pincode", "idType", "idLast4", "gender", "nationality"]

/** Below this, the reader is guessing and the screen says so rather than passing it off as read. */
export const LOW_CONFIDENCE = 0.75

/** The draft as the guest record wants it, for the desk's apply/check-in call. */
export function toGuestInput(draft: Draft) {
  const s = (f: FieldName) => String(draft[f] ?? "")
  return {
    name: s("name").trim(),
    phone: s("phone"),
    city: s("city"),
    address: s("address"),
    nationality: s("nationality") || "IN",
    idType: s("idType") || null,
    idLast4: s("idLast4") || null,
    passportNo: s("passportNo") || null,
    email: s("email") || null,
    state: s("state"),
    country: s("country"),
    notes: "",
  }
}
