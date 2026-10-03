import { useState } from "react"

import { Button, Empty, ListCard, ListRow, PageHeader, Screen } from "@/components"
import { translate } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { formatDateTime } from "@/utils/date"

import { clearFailed, failed } from "../queue"
import { syncEvents } from "../syncEvents"

/** Queued writes the server refused: what it said, and a "Done" to clear each once handled by hand. */
export function NeedsAttentionScreen() {
  const navigation = useAppNavigation()
  const [entries, setEntries] = useState(failed())

  const done = (clientUuid: string) => {
    clearFailed(clientUuid)
    const next = failed()
    setEntries(next)
    syncEvents.emit("counts", { pending: 0, failed: next.length })
  }

  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["top"]}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <PageHeader title={translate("offline.needsAttention")} onBack={() => navigation.goBack()} />
      {entries.length === 0 && <Empty text={translate("empty.needsAttention")} />}
      {entries.length > 0 && (
        <ListCard>
          {entries.map((e, i) => (
            <ListRow
              key={e.clientUuid}
              title={e.error || translate("offline.conflict")}
              subtitle={`${e.method} ${e.path} · ${formatDateTime(e.queuedAt)}`}
              right={
                <Button
                  preset="secondary"
                  size="sm"
                  text={translate("action.done")}
                  onPress={() => done(e.clientUuid)}
                />
              }
              chevron={false}
              last={i === entries.length - 1}
            />
          ))}
        </ListCard>
      )}
    </Screen>
  )
}
