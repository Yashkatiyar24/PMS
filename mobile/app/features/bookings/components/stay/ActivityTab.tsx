import { Empty, ListCard, ListRow, Loading } from "@/components"
import { useResource } from "@/hooks/useResource"
import { translate, translateOr } from "@/i18n/translate"
import { api } from "@/services/api"
import { formatDateTime } from "@/utils/date"

import type { Activity } from "../../types"

/** What happened to this booking, from the audit log. */
export function ActivityTab({ bookingId }: { bookingId: string }) {
  const activity = useResource<Activity[]>(() => api.bookings.activity(bookingId), [bookingId])
  if (!activity.data) return <Loading rows={2} />
  if (activity.data.length === 0) return <Empty text={translate("res.noActivity")} />
  return (
    <ListCard>
      {activity.data.map((a, i) => (
        <ListRow
          key={`${a.at}-${i}`}
          title={translateOr(
            `activity.${a.table}.${a.action}`,
            `${a.table} ${a.action}`.replace(/_/g, " "),
          )}
          subtitle={`${formatDateTime(a.at)} · ${a.userName ? translate("res.by", { name: a.userName }) : translate("res.system")}`}
          chevron={false}
          last={i === activity.data!.length - 1}
        />
      ))}
    </ListCard>
  )
}
