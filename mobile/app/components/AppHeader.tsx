import { useState } from "react"
import { Pressable, View, type ViewStyle, type TextStyle } from "react-native"
import { observer } from "mobx-react-lite"

import { UserMenuSheet } from "@/features/auth/components/UserMenuSheet"
import { BookingSearchSheet } from "@/features/bookings/components/BookingSearchSheet"
import { useUnreadCount } from "@/features/notifications/hooks/useUnreadCount"
import { translate } from "@/i18n/translate"
import { useStores } from "@/models/useStores"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { useAppTheme } from "@/theme/context"

import { Avatar } from "./Avatar"
import { Banner } from "./Banner"
import { Text } from "./Text"

/** The phone header on every tab root: property name, search, bell with unread badge, avatar menu; billing banners. */
export const AppHeader = observer(function AppHeader() {
  const { auth } = useStores()
  const { theme } = useAppTheme()
  const navigation = useAppNavigation()
  const [menu, setMenu] = useState(false)
  const [search, setSearch] = useState(false)
  const unread = useUnreadCount()
  const desk = auth.has("reservations.view")
  const billing = auth.user?.billingStatus

  return (
    <View style={$wrap}>
      <View style={$row}>
        <View style={$brand}>
          <View style={[$logo, { backgroundColor: theme.colors.primaryButton }]}>
            <Text text="⌂" style={{ color: theme.colors.onSolid, fontSize: 18 }} />
          </View>
          <Text
            text={auth.propertyName || translate("mobile.appName")}
            style={[$name, { color: theme.colors.text }]}
            numberOfLines={1}
          />
        </View>
        {!!desk && (
          <Pressable
            onPress={() => setSearch(true)}
            accessibilityRole="button"
            accessibilityLabel={translate("mobile.searchBookings")}
            style={$icon}
          >
            <Text text="⌕" style={[$glyph, { color: theme.colors.text }]} />
          </Pressable>
        )}
        <Pressable
          onPress={() => navigation.navigate("Notifications")}
          accessibilityRole="button"
          accessibilityLabel={translate("notif.title")}
          style={$icon}
        >
          <Text text="🔔" style={$glyph} />
          {unread > 0 && (
            <View style={[$badge, { backgroundColor: theme.colors.palette.danger }]}>
              <Text
                text={unread > 99 ? "99+" : String(unread)}
                style={[$badgeText, { color: theme.colors.palette.onSolid }]}
              />
            </View>
          )}
        </Pressable>
        <Pressable
          onPress={() => setMenu(true)}
          accessibilityRole="button"
          accessibilityLabel={auth.user?.name ?? ""}
          testID="user-menu"
        >
          <Avatar name={auth.user?.name} size={36} />
        </Pressable>
      </View>
      {billing === "overdue" && <Banner tone="warn" text={translate("billing.overdue")} />}
      {billing === "readonly" && <Banner tone="danger" text={translate("billing.readonly")} />}
      <UserMenuSheet open={menu} onClose={() => setMenu(false)} />
      <BookingSearchSheet open={search} onClose={() => setSearch(false)} />
    </View>
  )
})

const $wrap: ViewStyle = { gap: 8, paddingBottom: 4 }
const $row: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 48 }
const $brand: ViewStyle = { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }
const $logo: ViewStyle = {
  width: 32,
  height: 32,
  borderRadius: 10,
  alignItems: "center",
  justifyContent: "center",
}
const $name: TextStyle = { fontSize: 17, fontWeight: "800", flex: 1 }
const $icon: ViewStyle = { width: 40, height: 40, alignItems: "center", justifyContent: "center" }
const $glyph: TextStyle = { fontSize: 20 }
const $badge: ViewStyle = {
  position: "absolute",
  top: 2,
  right: 2,
  minWidth: 18,
  height: 18,
  borderRadius: 9,
  paddingHorizontal: 4,
  alignItems: "center",
  justifyContent: "center",
}
const $badgeText: TextStyle = { fontSize: 10, fontWeight: "700" }
