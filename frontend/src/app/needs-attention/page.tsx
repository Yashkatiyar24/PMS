"use client"

/**
 * Offline entries the server refused, usually because the unit was taken while the phone was offline.
 * They are never dropped silently: the desk sees what happened and redoes it, then clears the entry.
 */
import { AlertTriangle } from "lucide-react"
import { clearFailed, failed, type QueuedRequest } from "@/lib/offline-queue"
import { useResource } from "@/lib/use-resource"
import { formatDateTime } from "@/lib/format"
import { useI18n } from "@/i18n"
import { Avatar, Button, Empty, ListCard, ListRow, PageHeader } from "@/components/ui"

export default function NeedsAttentionPage() {
  const { t } = useI18n()
  const { data, reload } = useResource<QueuedRequest[]>(() => failed(), [], t("error.generic"))
  const entries = data ?? []

  return (
    <div className="space-y-4">
      <PageHeader title={t("offline.needsAttention")} back="/" />
      {entries.length === 0 ? (
        <Empty />
      ) : (
        <ListCard>
          {entries.map((entry) => (
            <ListRow
              key={entry.clientUuid}
              leading={<Avatar tone="danger" icon={AlertTriangle} size={38} />}
              title={entry.error ?? t("offline.conflict")}
              subtitle={`${entry.method} ${entry.path} · ${formatDateTime(entry.queuedAt)}`}
              right={
                <Button variant="secondary" size="sm" onClick={async () => { await clearFailed(entry.clientUuid); reload() }}>
                  {t("action.done")}
                </Button>
              }
            />
          ))}
        </ListCard>
      )}
    </div>
  )
}
