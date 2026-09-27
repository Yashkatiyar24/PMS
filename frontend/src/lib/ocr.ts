/**
 * Reads the ID number off a photographed card, on this device alone: the photo and the
 * full number never leave the phone, which is the same promise the register makes
 * ("never enter the full Aadhaar number"). Runs Tesseract in a web worker, loaded only
 * when the first photo is taken, from assets this app serves itself (public/ocr, copied
 * from node_modules on install) — no CDN, so it keeps working offline once cached.
 * A failure of any kind returns null; the desk just types the digits as before.
 */
import type { Worker } from "tesseract.js"

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

let worker: Promise<Worker> | null = null

async function getWorker(): Promise<Worker> {
  const { createWorker } = await import("tesseract.js")
  const w = await createWorker("eng", 1 /* LSTM only: matches the -lstm cores we ship */, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/core",
    langPath: "/ocr/lang",
  })
  // Digits are all we keep, and not guessing letters stops 0/O and 1/I mix-ups.
  await w.setParameters({ tessedit_char_whitelist: "0123456789 " })
  return w
}

/** The number read off the photo, or null: never an error, never a wait the desk notices. */
export async function readIdFromPhoto(image: Blob): Promise<ReturnType<typeof extractId>> {
  try {
    worker ??= getWorker()
    const w = await worker
    const result = await Promise.race([
      w.recognize(image),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 30_000)),
    ])
    return result ? extractId(result.data.text) : null
  } catch {
    worker = null // a broken worker is not reused; the next photo starts fresh
    return null
  }
}
