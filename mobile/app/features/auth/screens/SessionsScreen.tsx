import {
  Avatar,
  Button,
  Empty,
  ErrorState,
  ListCard,
  ListRow,
  Loading,
  PageHeader,
  Screen,
  showError,
  showToast,
} from "@/components"
import { useResource } from "@/hooks/useResource"
import { translate } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { formatDateTime } from "@/utils/date"

import type { SessionView } from "../types"

/** Every device signed in as this user; revoke one that is lost. */
export function SessionsScreen() {
  const navigation = useAppNavigation()
  const sessions = useResource<SessionView[]>(() => api.auth.sessions(), [])

  const revoke = async (s: SessionView) => {
    const result = await api.auth.revokeSession(s.id)
    if (!result.ok) return showError(result.problem)
    showToast(translate("mobile.done"), "ok")
    void sessions.reload()
  }

  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["top"]}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <PageHeader title={translate("mobile.sessions")} onBack={() => navigation.goBack()} />
      {!!sessions.loading && <Loading />}
      {!!sessions.problem && !sessions.data && (
        <ErrorState message={sessions.problem.message} onRetry={sessions.reload} />
      )}
      {!!sessions.data && sessions.data.length === 0 && <Empty />}
      {!!sessions.data && sessions.data.length > 0 && (
        <ListCard>
          {sessions.data.map((s, i) => (
            <ListRow
              key={s.id}
              leading={<Avatar icon="phone" tone={s.current ? "ok" : "neutral"} />}
              title={s.current ? translate("mobile.thisDevice") : s.deviceName || "—"}
              subtitle={translate("mobile.lastSeen", { when: formatDateTime(s.lastSeenAt) })}
              right={
                s.current ? undefined : (
                  <Button
                    preset="secondary"
                    size="sm"
                    text={translate("mobile.signOutDevice")}
                    onPress={() => void revoke(s)}
                  />
                )
              }
              chevron={false}
              last={i === sessions.data!.length - 1}
            />
          ))}
        </ListCard>
      )}
    </Screen>
  )
}
