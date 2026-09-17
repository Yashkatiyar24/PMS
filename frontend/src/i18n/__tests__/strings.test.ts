import { describe, expect, it } from "vitest"
import en from "../en.json"
import hi from "../hi.json"

/**
 * The PRD requires that no screen ships in English only. This test is what enforces it: adding an English
 * string without its Hindi translation fails the build.
 */
describe("translations", () => {
  it("has a Hindi string for every English string", () => {
    const missing = Object.keys(en).filter((key) => !(key in hi))
    expect(missing).toEqual([])
  })

  it("has no Hindi strings the English file does not define", () => {
    const extra = Object.keys(hi).filter((key) => !(key in en))
    expect(extra).toEqual([])
  })

  it("keeps the same placeholders in both languages", () => {
    const placeholders = (text: string) => (text.match(/\{(\w+)\}/g) ?? []).sort()
    for (const [key, english] of Object.entries(en as Record<string, string>)) {
      expect(placeholders((hi as Record<string, string>)[key])).toEqual(placeholders(english))
    }
  })

  it("actually uses Devanagari, not transliteration", () => {
    const devanagari = /[ऀ-ॿ]/
    const latinOnly = Object.entries(hi as Record<string, string>)
      .filter(([key]) => !key.startsWith("common.language"))
      .filter(([, text]) => text.length > 3 && !devanagari.test(text))
      .map(([key]) => key)
    expect(latinOnly).toEqual([])
  })
})
