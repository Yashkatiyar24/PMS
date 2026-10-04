import { View, type ViewStyle } from "react-native"

import { Avatar, Chip, Empty, ListCard, ListRow } from "@/components"
import { translate } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { formatDate } from "@/utils/date"
import { rupees } from "@/utils/format"

import { nightsOf, stateLabel, stateTone, unitsLabel } from "../lib/bookingLabels"
import type { Booking } from "../types"

export type StayListProps = { stays: Booking[]; emptyText?: string }

/** Rows of stays (guest, units, dates, nights, state, balance) that open the stay. */
export function StayList({ stays, emptyText }: StayListProps) {
  const navigation = useAppNavigation()
  if (stays.length === 0) return <Empty text={emptyText ?? translate("today.empty")} />
  return (
    <ListCard>
      {stays.map((b, i) => {
        const nights = nightsOf(b)
        const title = b.groupName ?? b.guestName
        const due = b.balanceDuePaise
        return (
          <ListRow
            key={b.id}
            leading={<Avatar name={b.guestName} tone={stateTone(b.state)} />}
            title={title}
            subtitle={`${unitsLabel(b)} · ${formatDate(b.arriveAt)} → ${formatDate(b.departAt)} · ${nights} ${translate("res.nights").toLowerCase()}`}
            right={
              <View style={$chips}>
                <Chip tone={stateTone(b.state)} text={stateLabel(b.state)} />
                <Chip
                  tone={due > 0 ? "danger" : "ok"}
                  text={due > 0 ? rupees(due) : translate("stay.paid")}
                />
              </View>
            }
            onPress={() => navigation.navigate("Stay", { id: b.id })}
            last={i === stays.length - 1}
          />
        )
      })}
    </ListCard>
  )
}

const $chips: ViewStyle = { alignItems: "flex-end", gap: 4 }
