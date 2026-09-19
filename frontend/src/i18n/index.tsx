"use client"

/**
 * Hindi and English, switched with one tap.
 *
 * Strings live in one JSON per language and are checked to match, so a screen can never appear in English
 * only. The chosen language and text size are remembered on the device, because the desk phone is shared
 * and nobody wants to set them again every morning.
 */
import { createContext, useContext, useEffect, useMemo } from "react"
import { usePreference } from "@/lib/device"
import en from "./en.json"
import hi from "./hi.json"

const BUNDLES = { en, hi } as const
export type Language = keyof typeof BUNDLES
export type TextSize = "normal" | "large"
export type Theme = "light" | "dark" | "system"

type I18n = {
  language: Language
  setLanguage: (language: Language) => void
  textSize: TextSize
  setTextSize: (size: TextSize) => void
  theme: Theme
  setTheme: (theme: Theme) => void
  /** Translate a key, filling {placeholders}. Falls back to English, then to the key itself. */
  t: (key: keyof typeof en, values?: Record<string, string | number>) => string
}

const Context = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = usePreference<Language>("pms.language", "hi", (v) => v in BUNDLES)
  const [textSize, setTextSize] = usePreference<TextSize>("pms.textSize", "normal", (v) => v === "normal" || v === "large")
  const [theme, setTheme] = usePreference<Theme>("pms.theme", "light", (v) => v === "light" || v === "dark" || v === "system")

  // The document itself is the external system here: the lang attribute and the text-size scale live on it.
  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dataset.text = textSize
    if (theme === "system") delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
  }, [language, textSize, theme])

  const t = useMemo<I18n["t"]>(
    () => (key, values) => {
      const template = (BUNDLES[language] as Record<string, string>)[key] ?? (en as Record<string, string>)[key] ?? key
      if (!values) return template
      return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`))
    },
    [language],
  )

  const value = useMemo(
    () => ({ language, setLanguage, textSize, setTextSize, theme, setTheme, t }),
    [language, setLanguage, textSize, setTextSize, theme, setTheme, t],
  )
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useI18n(): I18n {
  const context = useContext(Context)
  if (!context) throw new Error("useI18n must be used inside I18nProvider")
  return context
}
