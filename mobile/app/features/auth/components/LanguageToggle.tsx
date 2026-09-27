import { useState } from "react"

import { Button } from "@/components"
import { currentLanguage, setLanguage } from "@/i18n"

/** EN / हिं switch, as on the web's login page. */
export function LanguageToggle() {
  const [lang, setLang] = useState(currentLanguage())
  const toggle = async () => {
    const next = lang === "hi" ? "en" : "hi"
    await setLanguage(next)
    setLang(next)
  }
  return (
    <Button
      preset="secondary"
      size="sm"
      text={lang === "hi" ? "EN" : "हिं"}
      onPress={toggle}
      accessibilityLabel="Language"
    />
  )
}
