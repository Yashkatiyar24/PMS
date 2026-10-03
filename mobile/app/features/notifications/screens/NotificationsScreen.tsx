import { useEffect } from "react"
import { observer } from "mobx-react-lite"

import {
  Avatar,
  Empty,
  ErrorState,
  KV,
  ListCard,
  ListRow,
  Loading,
  PageHeader,
  Panel,
  Screen,
} from "@/components"
import type { GlyphName } from "@/components/Glyph"
import { translate } from "@/i18n/translate"
import { useStores } from "@/models/useStores"
import { openPath } from "@/navigators/linking"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import type { Tone } from "@/theme/tones"
import { formatDateTime } from "@/utils/date"

import type { NotificationItem } from "../types"

const LOOK: Record<string, { icon: GlyphName; tone: Tone }> = {
  new_booking: { icon: "calendar", tone: "brand" },
  booking_cancelled: { icon: "close", tone: "neutral" },
  payment_received: { icon: "rupee", tone: "ok" },
  payment_failed: { icon: "rupee", tone: "danger" },
  payment_after_expiry: { icon: "rupee", tone: "warn" },
  payment_short: { icon: "rupee", tone: "warn" },
  check_in: { icon: "login", tone: "ok" },
  checkout_reminder: { icon: "clock", tone: "warn" },
  room_ready: { icon: "check", tone: "teal" },
  room_dirty: { icon: "broom", tone: "warn" },
  maintenance: { icon: "wrench", tone: "warn" },
  low_stock: { icon: "bag", tone: "violet" },
}

/** The feed: everything this role cares about, newest first; opening it marks all seen. */
export const NotificationsScreen = observer(function NotificationsScreen() {
  const { notifications } = useStores()
  const navigation = useAppNavigation()

  useEffect(() => {
    void notifications.load().then(() => notifications.markSeen())
  }, [notifications])

  const open = (n: NotificationItem) => {
    if (!openPath(n.link)) return
  }

  const items = notifications.items
  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["top"]}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <PageHeader
        title={translate("notif.title")}
        subtitle={translate("notif.new", { n: notifications.unread })}
        onBack={() => navigation.goBack()}
      />
      <Panel>
        <KV label={translate("notif.unread")} value={String(notifications.unread)} />
        <KV label={translate("common.all")} value={String(items.length)} />
      </Panel>
      {!!notifications.loading && items.length === 0 && <Loading />}
      {!!notifications.problem && items.length === 0 && (
        <ErrorState
          message={notifications.problem.message}
          onRetry={() => void notifications.load()}
        />
      )}
      {!notifications.loading && items.length === 0 && !notifications.problem && (
        <Empty text={translate("notif.none")} />
      )}
      {items.length > 0 && (
        <ListCard>
          {items.map((n, i) => {
            const look = LOOK[n.kind] ?? { icon: "bell", tone: "neutral" as Tone }
            return (
              <ListRow
                key={n.id}
                leading={<Avatar icon={look.icon} tone={look.tone} />}
                title={n.title}
                subtitle={`${n.body ? `${n.body} · ` : ""}${formatDateTime(n.createdAt)}`}
                onPress={n.link ? () => open(n) : undefined}
                struck={false}
                last={i === items.length - 1}
              />
            )
          })}
        </ListCard>
      )}
    </Screen>
  )
})
