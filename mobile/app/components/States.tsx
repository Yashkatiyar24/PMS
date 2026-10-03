import { useEffect, useRef } from "react"
import { Animated, Platform, View, type ViewStyle, type TextStyle } from "react-native"

import { useReducedMotion } from "@/hooks/useReducedMotion"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { ageOf } from "@/utils/date"

import { Banner } from "./Banner"
import { Button } from "./Button"
import { Text } from "./Text"

const NATIVE = Platform.OS !== "web"

/**
 * One grey row that breathes: its opacity rises and falls so the screen reads as "coming", not "stuck". The rows
 * start a beat apart, which is what makes a column of them look like one thing loading rather than six blinking.
 * A phone set to reduce motion gets the rows still.
 */
function Skeleton({ delay, style }: { delay: number; style?: ViewStyle }) {
  const { theme } = useAppTheme()
  const reduced = useReducedMotion()
  const opacity = useRef(new Animated.Value(0.55)).current
  useEffect(() => {
    if (reduced) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: NATIVE }),
        Animated.timing(opacity, { toValue: 0.55, duration: 650, useNativeDriver: NATIVE }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [delay, opacity, reduced])
  return (
    <Animated.View
      style={[$skeleton, { backgroundColor: theme.colors.surface2, opacity }, style]}
    />
  )
}

/** Loading rows while a list fetches for the first time. */
export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <View
      style={$loading}
      accessibilityRole="progressbar"
      accessibilityLabel={translate("common.loading")}
    >
      <Skeleton delay={0} style={$skeletonTitle} />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} delay={(i + 1) * 90} />
      ))}
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
    <View style={[$empty, { backgroundColor: theme.colors.surface2 }]}>
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
const $skeletonTitle: ViewStyle = { height: 18, width: "45%", borderRadius: 6 }
const $empty: ViewStyle = {
  borderRadius: 18,
  padding: 24,
  alignItems: "center",
  gap: 12,
}
const $emptyText: TextStyle = { textAlign: "center" }
const $stale: TextStyle = { textAlign: "center", paddingVertical: 4 }
