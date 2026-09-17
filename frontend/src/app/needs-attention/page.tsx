"use client"

/**
 * Offline entries the server refused, usually because the unit was taken while the phone was offline.
 * They are never dropped silently: the desk sees what happened and redoes it, then clears the entry.
 */
import Link from "next/link"
import { clearFailed, failed, type QueuedRequest } from "@/lib/offline-queue"
import { useResource } from "@/lib/use-resource"
import { formatDateTime } from "@/lib/format"
import { useI18n } from "@/i18n"
import { Button, Card, Empty } from "@/components/ui"

export default function NeedsAttentionPage() {
  const { t } = useI18n()
  const { data, reload } = useResource<QueuedRequest[]>(() => failed(), [], t("error.generic"))
  const entries = data ?? []

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("offline.needsAttention")}</h1>
      {entries.length === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.clientUuid}>
              <Card className="space-y-2">
                <p className="text-sm font-semibold">{entry.error ?? t("offline.conflict")}</p>
                <p className="text-xs text-[var(--color-ink-soft)]">
                  {entry.method} {entry.path} · {formatDateTime(entry.queuedAt)}
                </p>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={async () => { await clearFailed(entry.clientUuid); reload() }}
                >
                  {t("action.done")}
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Link href="/">
        <Button variant="ghost" className="w-full">
          {t("action.back")}
        </Button>
      </Link>
    </div>
  )
}
