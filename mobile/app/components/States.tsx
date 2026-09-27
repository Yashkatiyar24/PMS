import { ActivityIndicator, View, type ViewStyle, type TextStyle } from "react-native"

import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { ageOf } from "@/utils/date"

import { Banner } from "./Banner"
import { Button } from "./Button"
import { Text } from "./Text"

/** Loading rows while a list fetches for the first time. */
export function Loading({ rows = 3 }: { rows?: number }) {
  const { theme } = useAppTheme()
  return (
    <View
      style={$loading}
      accessibilityRole="progressbar"
      accessibilityLabel={translate("common.loading")}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={[$skeleton, { backgroundColor: theme.colors.surface2 }]} />
      ))}
      <ActivityIndicator color={theme.colors.tint} />
    </View>
  )
}

/** Nothing to show; optional action. */
export function Empty({
  text,
  actionText,
  onAction,
}: {
  text?: string
  actionText?: string
  onAction?: () => void
}) {
  const { theme } = useAppTheme()
  return (
    <View style={[$empty, { borderColor: theme.colors.borderStrong }]}>
      <Text
        text={text ?? translate("today.empty")}
        size="sm"
        style={[$emptyText, { color: theme.colors.textDim }]}
      />
      {!!actionText && !!onAction && (
        <Button preset="secondary" size="sm" text={actionText} onPress={onAction} />
      )}
    </View>
  )
}

/** A load failed; say why and offer a retry. */
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <Banner
      tone="danger"
      text={message || translate("error.generic")}
      actionText={onRetry ? translate("mobile.retry") : undefined}
      onAction={onRetry}
    />
  )
}

/** "Updated 5 min ago" under a list that came from the cache. */
export function StaleLabel({ fetchedAt }: { fetchedAt: string | null }) {
  const { theme } = useAppTheme()
  if (!fetchedAt) return null
  const age = ageOf(fetchedAt)
  const when =
    age.unit === "now"
      ? translate("mobile.justNow")
      : age.unit === "minutes"
        ? translate("mobile.minutesAgo", { n: age.n })
        : age.unit === "hours"
          ? translate("mobile.hoursAgo", { n: age.n })
          : translate("mobile.daysAgo", { n: age.n })
  return (
    <Text
      text={translate("mobile.updatedAgo", { when })}
      size="xxs"
      style={[$stale, { color: theme.colors.textFaint }]}
    />
  )
}

const $loading: ViewStyle = { gap: 10, paddingVertical: 12 }
const $skeleton: ViewStyle = { height: 56, borderRadius: 14 }
const $empty: ViewStyle = {
  borderWidth: 1,
  borderStyle: "dashed",
  borderRadius: 16,
  padding: 24,
  alignItems: "center",
  gap: 12,
}
const $emptyText: TextStyle = { textAlign: "center" }
const $stale: TextStyle = { textAlign: "center", paddingVertical: 4 }
