import { View, type ViewStyle } from "react-native"

import { Button, Chip, ListCard, ListRow, Panel, SectionLabel, Text } from "@/components"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { formatDate } from "@/utils/date"
import { nightsBetween } from "@/utils/date"
import { rupees, unitName } from "@/utils/format"

import type { Booking, BookingUnit } from "../../types"

export type AccommodationTabProps = {
  booking: Booking
  canEdit: boolean
  onChangeUnit: (unit: BookingUnit) => void
  onReleaseUnit: (unit: BookingUnit) => void
}

/** Rooms/beds of the stay with change / give-back, the party, requests and notes. */
export function AccommodationTab({
  booking,
  canEdit,
  onChangeUnit,
  onReleaseUnit,
}: AccommodationTabProps) {
  const { theme } = useAppTheme()
  const live =
    booking.state === "reserved" || booking.state === "pending" || booking.state === "checked_in"
  return (
    <View style={$wrap}>
      <ListCard>
        {booking.units.map((u, i) => {
          const released =
            u.departAt < booking.departAt &&
            booking.state !== "reserved" &&
            booking.state !== "pending"
          return (
            <ListRow
              key={u.id}
              title={unitName(u.roomNumber, u.bedLabel)}
              subtitle={`${formatDate(u.arriveAt)} → ${formatDate(u.departAt)} · ${nightsBetween(u.arriveAt, u.departAt)} ${translate("res.nights").toLowerCase()} · ${rupees(u.ratePaise)}`}
              right={
                <View style={$actions}>
                  {released && <Chip tone="neutral" text={translate("stay.released")} />}
                  {live && canEdit && !released && (
                    <Button
                      preset="secondary"
                      size="sm"
                      text={translate("stay.changeUnit")}
                      onPress={() => onChangeUnit(u)}
                    />
                  )}
                  {live && canEdit && !released && booking.units.length > 1 && (
                    <Button
                      preset="ghost"
                      size="sm"
                      text={translate("stay.releaseUnit")}
                      onPress={() => onReleaseUnit(u)}
                    />
                  )}
                </View>
              }
              chevron={false}
              last={i === booking.units.length - 1}
            />
          )
        })}
      </ListCard>
      {booking.members.length > 0 && (
        <>
          <SectionLabel text={translate("stay.party")} />
          <View style={$chips}>
            {booking.members.map((m, i) => {
              const unit = booking.units.find((u) => u.id === m.unitId)
              return (
                <Chip
                  key={m.id ?? i}
                  tone={m.adult ? "brand" : "teal"}
                  text={`${m.name} · ${unit ? unitName(unit.roomNumber, unit.bedLabel) : translate("stay.notAllocated")}`}
                />
              )
            })}
          </View>
        </>
      )}
      {(booking.specialRequests || booking.notes) && (
        <Panel>
          {!!booking.specialRequests && (
            <Text
              text={`${translate("booking.specialRequests")}: ${booking.specialRequests}`}
              size="sm"
              style={{ color: theme.colors.text }}
            />
          )}
          {!!booking.notes && (
            <Text
              text={`${translate("booking.notes")}: ${booking.notes}`}
              size="sm"
              style={{ color: theme.colors.textDim }}
            />
          )}
        </Panel>
      )}
    </View>
  )
}

const $wrap: ViewStyle = { gap: 12 }
const $actions: ViewStyle = { alignItems: "flex-end", gap: 4 }
const $chips: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 6 }
