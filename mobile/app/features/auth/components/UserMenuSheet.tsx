import { useState } from "react"
import { observer } from "mobx-react-lite"

import { ActionSheet, Sheet, type ActionItem } from "@/components"
import { currentLanguage, setLanguage } from "@/i18n"
import { translate } from "@/i18n/translate"
import { useStores } from "@/models/useStores"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { useAppTheme } from "@/theme/context"
import { loadPreference, savePreference } from "@/utils/storage"

import { ChangePasswordForm } from "./ChangePasswordForm"

const TEXT_SIZE_KEY = "pms.textSize"

/** The avatar menu: notifications, properties, language, text size, appearance, password, devices, log out. */
export const UserMenuSheet = observer(function UserMenuSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { auth } = useStores()
  const navigation = useAppNavigation()
  const { themeContext, setThemeContextOverride } = useAppTheme()
  const [changing, setChanging] = useState(false)
  const [, bump] = useState(0)
  const go = (screen: "Notifications" | "Portfolio" | "Sessions") => navigation.navigate(screen)

  const textSize = loadPreference(TEXT_SIZE_KEY) === "large" ? "large" : "normal"
  const themeLabel =
    loadPreference("pms.theme") === "system" || !loadPreference("pms.theme")
      ? "system"
      : themeContext

  const items: ActionItem[] = [
    { label: translate("notif.title"), onPress: () => go("Notifications") },
    ...(auth.otherMemberships.length > 0
      ? [{ label: translate("portfolio.title"), onPress: () => go("Portfolio") }]
      : []),
    ...auth.otherMemberships.map((m) => ({
      label: translate("portfolio.switchTo", { name: m.propertyName }),
      onPress: () => void auth.switchProperty(m.propertyId),
    })),
    {
      label: `${translate("common.language")}: ${currentLanguage() === "hi" ? "हिंदी" : "English"}`,
      separator: true,
      onPress: () =>
        void setLanguage(currentLanguage() === "hi" ? "en" : "hi").then(() => bump((n) => n + 1)),
    },
    {
      label: `${translate("common.textSize")}: ${translate(textSize === "large" ? "common.large" : "common.normal")}`,
      onPress: () => {
        savePreference(TEXT_SIZE_KEY, textSize === "large" ? "normal" : "large")
        bump((n) => n + 1)
      },
    },
    {
      label: `${translate("common.theme")}: ${translate(`theme.${themeLabel}` as "theme.light")}`,
      onPress: () => {
        const next = themeLabel === "light" ? "dark" : themeLabel === "dark" ? "system" : "light"
        setThemeContextOverride(next === "system" ? undefined : next)
      },
    },
    {
      label: translate("account.changePassword"),
      separator: true,
      onPress: () => setChanging(true),
    },
    { label: translate("mobile.sessions"), onPress: () => go("Sessions") },
    {
      label: translate("action.logout"),
      danger: true,
      separator: true,
      onPress: () => void auth.logout(),
    },
  ]

  return (
    <>
      <ActionSheet
        open={open && !changing}
        onClose={onClose}
        title={auth.user?.name ?? ""}
        items={items}
      />
      <Sheet
        open={changing}
        onClose={() => setChanging(false)}
        title={translate("account.changePassword")}
      >
        <ChangePasswordForm requireCurrent onDone={() => setChanging(false)} />
      </Sheet>
    </>
  )
})
