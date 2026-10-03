import { useState } from "react"
import { Pressable, type TextStyle, type ViewStyle } from "react-native"

import { Text } from "@/components"
import { currentLanguage, setLanguage } from "@/i18n"
import { useAppTheme } from "@/theme/context"

/** EN / हिं switch, as on the web's login page. `light` draws it in white for a dark band. */
export function LanguageToggle({ light }: { light?: boolean }) {
  const { theme } = useAppTheme()
  const [lang, setLang] = useState(currentLanguage())
  const toggle = async () => {
    const next = lang === "hi" ? "en" : "hi"
    await setLanguage(next)
    setLang(next)
  }
  const color = light ? theme.colors.palette.onSolid : theme.colors.palette.brandInk
  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel="Language"
      style={({ pressed }) => [
        $pill,
        {
          borderColor: light ? theme.colors.palette.onSolidSoft : theme.colors.palette.brand,
          backgroundColor: light
            ? theme.colors.palette.onSolidGlass
            : theme.colors.palette.brandSoft,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text text={lang === "hi" ? "EN" : "हिं"} style={[$label, { color }]} />
    </Pressable>
  )
}

const $pill: ViewStyle = {
  minHeight: 36,
  minWidth: 52,
  paddingHorizontal: 14,
  borderRadius: 18,
  borderWidth: 1,
  alignItems: "center",
  justifyContent: "center",
}
const $label: TextStyle = { fontSize: 13, fontWeight: "700", letterSpacing: 0.8 }
