/**
 * Reading an identity document, on the device holding it.
 *
 * The photograph and the full document number never leave the phone: Tesseract runs in a web worker here,
 * from assets this app serves itself (public/ocr, copied from node_modules on install), so it also keeps
 * working offline once cached. What leaves the device is the handful of fields a register asks for, with the
 * document's number reduced to its last four digits — the same promise the form makes to the guest.
 *
 * The same function runs on both sides of the desk: the guest photographing their own Aadhaar and the clerk
 * photographing it at the counter get identical fields out, because there is one reader and one field list.
 *
 * What comes back is a *suggestion* per field, with a confidence. It is never authority: empty fields are
 * filled from it, fields someone already answered are left alone and shown the suggestion to take or ignore.
 */
import type { FieldName, Suggestions } from "./checkin-fields"

export type DocType = "aadhaar" | "pan" | "voter" | "dl" | "passport" | null

/** The ID types the register knows, by the document each reader recognises. */
const AS_ID_TYPE: Record<Exclude<DocType, null>, string> = {
  aadhaar: "aadhaar", pan: "pan", voter: "voter", dl: "dl", passport: "passport",
}

/**
 * Pulls an ID number out of recognised text. A 12-digit run (possibly printed 4-4-4)
 * is an Aadhaar number; otherwise the longest digit run of six or more is taken as
 * the document number (voter EPIC, DL, passport all end in one).
 */
// ponytail: prefers the first exactly-12 run, so a card printing both VID (16) and
// Aadhaar picks the Aadhaar; anything cleverer needs per-document templates.
export function extractId(text: string): { idType: "aadhaar" | null; idLast4: string } | null {
  // Join digit groups split by spaces on the same line: "1234 5678 9012" → one run.
  const joined = text.replace(/(\d)[^\S\n]+(?=\d)/g, "$1")
  const runs = joined.match(/\d{6,}/g) ?? []
  if (runs.length === 0) return null
  const aadhaar = runs.find((r) => r.length === 12)
  const pick = aadhaar ?? runs.reduce((a, b) => (b.length > a.length ? b : a))
  return { idType: aadhaar ? "aadhaar" : null, idLast4: pick.slice(-4) }
}

/* ------------------------------------------------------------------ which document is this */

const PAN_NO = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/
const EPIC_NO = /\b[A-Z]{3}[0-9]{7}\b/
const PASSPORT_NO = /\b[A-Z][0-9]{7}\b/

/** Recognised from the words printed on the card; the number pattern decides when the words are unreadable. */
export function documentType(text: string): DocType {
  const up = text.toUpperCase()
  if (/INCOME TAX|PERMANENT ACCOUNT/.test(up) || PAN_NO.test(up)) return "pan"
  if (/ELECTION COMMISSION|ELECTOR|EPIC/.test(up) || EPIC_NO.test(up)) return "voter"
  if (/DRIVING LICEN[CS]E|TRANSPORT DEPARTMENT|\bDL\s?NO/.test(up)) return "dl"
  if (/PASSPORT|REPUBLIC OF INDIA/.test(up)) return "passport"
  if (/AADHAAR|UIDAI|UNIQUE IDENTIFICATION|आधार|भारत सरकार/.test(up) || /(?:\d[^\S\n]*){12}/.test(text)) return "aadhaar"
  return null
}

/* ------------------------------------------------------------------ the fields each document carries */

/** States and union territories, so a line of an address can be split where it names one. */
const STATES = ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
  "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttarakhand", "Uttar Pradesh", "West Bengal", "Delhi", "Jammu and Kashmir",
  "Ladakh", "Puducherry", "Chandigarh", "Andaman and Nicobar Islands", "Dadra and Nagar Haveli", "Lakshadweep"]

/** Lines that are a label or a printer's flourish, never somebody's name. */
const NOT_A_NAME = /government|india|authority|income tax|department|election|commission|licence|license|passport|aadhaar|uidai|address|पता|father|husband|guardian|पिता|date of birth|dob|male|female/i

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean)

/** `01/02/1990`, `01-02-1990`, `01.02.1990` → `1990-02-01`. A year on its own is not a date of birth. */
export function isoDate(text: string): string | null {
  const m = text.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/)
  if (!m) return null
  const [, d, mo, y] = m
  const day = Number(d), month = Number(mo), year = Number(y)
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > new Date().getFullYear()) return null
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/** The value after a label, on the same line or the next one. */
function labelled(all: string[], label: RegExp): string | null {
  for (let i = 0; i < all.length; i++) {
    const m = all[i].match(label)
    if (!m) continue
    const rest = all[i].slice(m.index! + m[0].length).replace(/^[\s:–—-]+/, "").trim()
    if (rest.length > 1) return rest
    const next = all[i + 1]
    if (next && !NOT_A_NAME.test(next)) return next
  }
  return null
}

/** The document number, by the pattern the document actually prints. */
function documentNumber(text: string, doc: DocType): string | null {
  const up = text.toUpperCase()
  const strict = doc === "pan" ? up.match(PAN_NO) : doc === "voter" ? up.match(EPIC_NO) : doc === "passport" ? up.match(PASSPORT_NO) : null
  if (strict) return strict[0]
  return extractId(text)?.idLast4 ?? null
}

/**
 * Everything a document gives up, as suggestions.
 *
 * Only what is found is returned — no document carries every field, and a blank suggestion is worse than
 * none because somebody has to notice it is blank. Confidence is the reader's own, discounted for fields
 * taken by position rather than from a printed label: a name read off the line above the date of birth is a
 * good guess, not a reading.
 *
 * @param confidence what the reader thought of this image overall, 0–1
 */
export function parseDocument(text: string, confidence = 0.8): Suggestions {
  const all = lines(text)
  const doc = documentType(text)
  const out: Suggestions = {}
  const sure = Math.min(0.98, confidence)
  const guess = Math.min(0.9, confidence * 0.75)
  const put = (field: FieldName, value: string | null | undefined, c: number) => {
    if (value && value.trim()) out[field] = { value: value.trim().slice(0, 300), confidence: c }
  }

  if (doc) out._doc = doc
  if (doc) put("idType", AS_ID_TYPE[doc], sure)

  const number = documentNumber(text, doc)
  if (number) put("idLast4", number.slice(-4), sure)
  if (doc === "passport" && number && number.length > 4) put("passportNo", number, sure)

  // Name: a printed label is believed, but only if what follows it still looks like a name — a card read in
  // bad light yields "be" after the word "Name", and a two-letter name passed off as read is worse than none.
  // Failing that, the line above the date of birth, which is where every one of these cards puts it.
  const dobLine = all.findIndex((l) => /dob|date of birth|जन्म|\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4}\b/i.test(l))
  // In order of how much they can be trusted: what followed a printed "Name", the line above the date of
  // birth, and — because a blurred card often comes back with the two running together on one line — whatever
  // stood before the date on that line. Each is cleaned first and then has to still look like somebody's
  // name, so a smudge read as "be" or a misread Hindi header falls through to the next candidate.
  const candidates: [string, number][] = [
    [labelled(all, /(?:elector'?s? name|name|नाम)\b/i) ?? "", sure],
    [dobLine > 0 ? all.slice(0, dobLine).reverse()
      // A line with a digit in it is a number, a date or an address, never a name — and "ABCDE1234F" cleaned
      // of its digits reads as a plausible five-letter name, which is how a PAN number became one.
      .find((line) => !/\d/.test(line) && looksLikeName(cleanName(line))) ?? "" : "", guess],
    [dobLine >= 0 ? all[dobLine].split(/\b(?:dob|date of birth|जन्म)\b|\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4}/i)[0] ?? "" : "", guess],
  ]
  for (const [raw, confidence] of candidates) {
    const candidate = cleanName(raw)
    if (looksLikeName(candidate)) { put("name", candidate, confidence); break }
  }

  put("dob", isoDate(text), sure)

  const gender = text.match(/\b(male|female|पुरुष|महिला)\b/i)?.[1]?.toLowerCase()
  if (gender) put("gender", gender === "पुरुष" ? "male" : gender === "महिला" ? "female" : gender, sure)

  // A six-digit group is a pincode; a longer run is a document number and is left alone.
  put("pincode", text.match(/(?<!\d)\d{6}(?!\d)/)?.[0], /pin|पिन/i.test(text) ? sure : guess)

  const state = STATES.find((s) => new RegExp(`\\b${s}\\b`, "i").test(text))
  if (state) put("state", state, sure)

  const address = labelled(all, /(?:address|पता)\b/i)
  if (address) {
    // The address block runs on past its label; take the lines after it up to the pincode.
    const start = all.findIndex((l) => /(?:address|पता)\b/i.test(l))
    const block = all.slice(start, start + 5).join(", ").replace(/^.*?(?:address|पता)\b[\s:–—-]*/i, "")
    put("address", block.replace(/\s*,\s*/g, ", ").slice(0, 300), guess)
    // The town is what sits before the state or the pincode in a printed Indian address.
    // ponytail: positional, so it is offered at a guess's confidence and a human confirms it.
    const city = block.split(",").map((p) => p.trim())
      .filter((p) => p.length > 2 && !/^\d/.test(p) && !STATES.some((s) => s.toLowerCase() === p.toLowerCase()))
      .pop()
    put("city", city, Math.min(0.7, guess))
  }

  if (doc === "passport") put("nationality", /INDIAN/i.test(text) ? "IN" : "", sure)
  return out
}

function looksLikeName(line: string) {
  // Four characters at the least, a vowel somewhere (Devanagari carries its own), and no more words than a
  // person has names. Everything else the reader produced from a smudge fails one of the three.
  if (!/[aeiouAEIOUऀ-ॿ]/.test(line)) return false
  return !NOT_A_NAME.test(line) && /^[A-Za-zऀ-ॿ.\s]{4,60}$/.test(line) && line.split(/\s+/).length <= 5
}

function cleanName(raw: string) {
  const words = raw.replace(/[^A-Za-zऀ-ॿ.\s]/g, " ").replace(/\s+/g, " ").trim().split(" ")
  // A stray one- or two-letter tail is the rest of the printed line the reader could not make out
  // ("Arjun Singh i"), never part of a name. A leading initial is kept: "K Ramesh" is somebody's name.
  while (words.length > 1 && words[words.length - 1].replace(/\./g, "").length <= 2) words.pop()
  return words.join(" ").slice(0, 120)
}

/* ------------------------------------------------------------------ the worker */

import type { Worker } from "tesseract.js"

let worker: Promise<Worker> | null = null

async function getWorker(): Promise<Worker> {
  const { createWorker } = await import("tesseract.js")
  const w = await createWorker("eng", 1 /* LSTM only: matches the -lstm cores we ship */, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/core",
    langPath: "/ocr/lang",
  })
  // No character whitelist: this reads names, dates and addresses as well as the number, and digits-only
  // recognition returned nothing for any of them. The declared DPI matters more than it looks: without it
  // Tesseract guesses from the pixel size and mis-scales its models for a photograph of a card.
  await w.setParameters({ user_defined_dpi: "300", preserve_interword_spaces: "1" })
  return w
}

/*
 * There is no image preparation step here on purpose, and it is worth saying why: grey-scaling, upscaling and
 * stretching the contrast of a photographed card — the usual advice — was measured against five noisy cards
 * by `ocr-check.mjs` and made things markedly worse. Tesseract's own confidence fell from the high 0.8s to
 * around 0.3 and names came back as fragments, because stretching the contrast of a noisy JPEG amplifies the
 * noise along with the letters and interpolating it larger gives the recogniser more of it to read. Its own
 * binarisation is better at this than a histogram stretch in a canvas. Anything added here has to beat the
 * benchmark before it stays.
 */

/**
 * What the photograph says, or null: never an error, never a wait anybody notices. Forty seconds is the
 * ceiling — past that the person types it in, which they can always do anyway.
 *
 * Confidence is per field, not per image: the words that make up a value are the ones that decide whether the
 * screen presents it as read or asks somebody to check it. A name read clearly off a blurred card is still a
 * name read clearly.
 */
export async function readIdFromPhoto(image: Blob): Promise<Suggestions | null> {
  try {
    worker ??= getWorker()
    const w = await worker
    const result = await Promise.race([
      w.recognize(image),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 40_000)),
    ])
    if (!result) return null
    const suggestions = parseDocument(result.data.text, (result.data.confidence ?? 80) / 100)
    return Object.keys(suggestions).length > 0 ? suggestions : null
  } catch {
    worker = null // a broken worker is not reused; the next photo starts fresh
    return null
  }
}
