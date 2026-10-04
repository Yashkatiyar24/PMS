import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import "intl-pluralrules"

import { loadPreference, savePreference } from "@/utils/storage"

import mobileEn from "./mobile-en.json"
import mobileHi from "./mobile-hi.json"
import en from "./web-en.json"
import hi from "./web-hi.json"

/** The languages the product speaks. Hindi first, as on the web. */
export type Language = "en" | "hi"
export const LANGUAGES: Language[] = ["hi", "en"]
const DEFAULT_LANGUAGE: Language = "hi"
const LANGUAGE_KEY = "pms.language"

const resources = {
  en: { translation: { ...en, ...mobileEn } },
  hi: { translation: { ...hi, ...mobileHi } },
}

/** Every key the app may translate: the web app's strings plus the mobile-only ones. */
export type TxKeyPath = keyof typeof en | keyof typeof mobileEn

export const isRTL = false

function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "hi"
}

/** The language saved on this device, or Hindi. */
export function savedLanguage(): Language {
  const stored = loadPreference(LANGUAGE_KEY)
  return isLanguage(stored) ? stored : DEFAULT_LANGUAGE
}

export const initI18n = async () => {
  i18n.use(initReactI18next)
  await i18n.init({
    resources,
    lng: savedLanguage(),
    fallbackLng: "en",
    // The web strings are flat keys with dots and `{name}` placeholders; keep them verbatim.
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false, prefix: "{", suffix: "}" },
  })
  return i18n
}

/** Switch language for the running app and remember it for next launch. */
export async function setLanguage(language: Language): Promise<void> {
  savePreference(LANGUAGE_KEY, language)
  await i18n.changeLanguage(language)
}

export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE
}
