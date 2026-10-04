/**
 * Reads the ID number off a photographed card, on this phone alone: ML Kit on Android and Apple Vision on iOS
 * both run on the device, so the photo and the full number never leave it — the same promise the register
 * makes ("never enter the full Aadhaar number"). Only the last four digits are handed back. The only file that
 * imports expo-text-extractor. Any failure returns null; the desk types the digits as before.
 */
import { extractTextFromImage, isSupported } from "expo-text-extractor"

import { logWarn } from "./logger"

export type IdRead = { idType: "aadhaar" | null; idLast4: string }

/**
 * Pulls an ID number out of recognised text (same rule as the web's `lib/ocr.ts`). A 12-digit run, possibly
 * printed 4-4-4, is an Aadhaar number; otherwise the longest digit run of six or more is the document number.
 */
export function extractId(text: string): IdRead | null {
  // Join digit groups split by spaces on the same line: "1234 5678 9012" → one run.
  const joined = text.replace(/(\d)[^\S\n]+(?=\d)/g, "$1")
  const runs = joined.match(/\d{6,}/g) ?? []
  if (runs.length === 0) return null
  const aadhaar = runs.find((r) => r.length === 12)
  const pick = aadhaar ?? runs.reduce((a, b) => (b.length > a.length ? b : a))
  return { idType: aadhaar ? "aadhaar" : null, idLast4: pick.slice(-4) }
}

/** Whether this device can read text from photos (false on web and on phones without the recogniser). */
export function canReadText(): boolean {
  return isSupported
}

/** The ID read off the photo at `uri`, or null: never throws, gives up after `timeoutMs`. */
export async function readIdFromPhoto(uri: string, timeoutMs = 15_000): Promise<IdRead | null> {
  if (!isSupported) return null
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const lines = await Promise.race([
      extractTextFromImage(uri),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs)
      }),
    ])
    return lines ? extractId(lines.join("\n")) : null
  } catch (e) {
    logWarn("ocr failed", e)
    return null
  } finally {
    clearTimeout(timer)
  }
}
