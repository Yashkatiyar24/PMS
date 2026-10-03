import { Linking, Pressable, View, type ViewStyle, type TextStyle } from "react-native"

import { Chip, Glyph, Panel, Text } from "@/components"
import type { Folio } from "@/features/folio/types"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { toneColors } from "@/theme/tones"
import { formatDate, formatDateTime, formatTime } from "@/utils/date"
import { formatPhone, reference, rupees } from "@/utils/format"

import {
  balanceDue,
  nightsOf,
  paymentTone,
  sourceLabel,
  stateLabel,
  stateTone,
  unitsLabel,
} from "../../lib/bookingLabels"
import type { Booking } from "../../types"

/** Title, chips, phone link and the facts strip at the top of a stay. */
export function StayHeader({ booking, folio }: { booking: Booking; folio: Folio | null }) {
  const { theme } = useAppTheme()
  const due = folio ? balanceDue(folio) : booking.balanceDuePaise
  const payLabel = translate(`payment.${booking.paymentStatus}` as "payment.paid")
  return (
    <View style={$wrap}>
      <View style={$chips}>
        <Chip tone="neutral" text={reference(booking.id)} />
        <Chip tone={stateTone(booking.state)} text={stateLabel(booking.state)} dot />
        <Chip tone={paymentTone(booking.paymentStatus)} text={payLabel} />
      </View>
      {!!booking.groupName && (
        <Text text={booking.guestName} size="sm" style={{ color: theme.colors.textDim }} />
      )}
      {!!booking.guestPhone && (
        <Pressable
          onPress={() => Linking.openURL(`tel:${booking.guestPhone}`)}
          accessibilityRole="link"
        >
          <View style={$phoneRow}>
            <Glyph name="phone" size={15} color={theme.colors.palette.brandInk} weight={2} />
            <Text
              text={formatPhone(booking.guestPhone)}
              style={[$phone, { color: theme.colors.palette.brandInk }]}
            />
          </View>
        </Pressable>
      )}
      <Panel>
        <View style={$grid}>
          <Fact
            label={translate("action.checkIn")}
            value={`${formatDate(booking.arriveAt)} ${formatTime(booking.arriveAt)}`}
          />
          <Fact
            label={translate("action.checkOut")}
            value={`${formatDate(booking.departAt)} ${formatTime(booking.departAt)}`}
          />
          <Fact label={translate("res.nights")} value={String(nightsOf(booking))} />
          <Fact label={translate("res.bookedOn")} value={formatDateTime(booking.createdAt)} />
          <Fact label={translate("res.guests")} value={`${booking.adults} + ${booking.children}`} />
          <Fact
            label={translate("res.source")}
            value={`${sourceLabel(booking.source)}${booking.organization ? ` · ${booking.organization}` : ""}`}
          />
          <Fact label={translate("res.col.room")} value={unitsLabel(booking) || "—"} />
          <Fact
            label={translate("stay.balance")}
            value={rupees(due)}
            tone={due > 0 ? "danger" : "ok"}
          />
        </View>
      </Panel>
    </View>
  )
}

/**
 * One fact of the stay, label above value.
 *
 * Side by side in a half-width column a label and a date cannot share a line — the date wins and the label is
 * crushed — so each fact stacks instead, which is how the web shows the same eight numbers.
 */
function Fact({ label, value, tone }: { label: string; value: string; tone?: "danger" | "ok" }) {
  const { theme } = useAppTheme()
  const color = tone ? toneColors(theme.colors, tone).solid : theme.colors.text
  return (
    <View style={$fact}>
      <Text text={label} size="xs" style={{ color: theme.colors.textDim }} />
      <Text text={value} size="sm" weight="bold" style={{ color }} />
    </View>
  )
}

const $wrap: ViewStyle = { gap: 8 }
const $chips: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 6 }
const $phoneRow: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 6 }
const $phone: TextStyle = { fontSize: 15, fontWeight: "600" }
const $grid: ViewStyle = { flexDirection: "row", flexWrap: "wrap" }
const $fact: ViewStyle = { width: "50%", paddingRight: 8, paddingVertical: 6, gap: 1 }
