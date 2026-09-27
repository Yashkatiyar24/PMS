import { useEffect, useRef, useState } from "react"
import { View, type ViewStyle } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import {
  Banner,
  Button,
  ChoiceChips,
  KV,
  Loading,
  MoneyInput,
  PageHeader,
  Panel,
  Screen,
  SectionLabel,
  Switch,
  showError,
} from "@/components"
import { GuestLookup } from "@/features/guests/components/GuestLookup"
import { useSettingsValues } from "@/features/settings/hooks/useSettingsValues"
import { settingBool, settingList, settingString } from "@/features/settings/types"
import { useResource } from "@/hooks/useResource"
import { translate, translateOr } from "@/i18n/translate"
import { useAppNavigation, useAppRoute } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { useAppTheme } from "@/theme/context"
import { diffInDays } from "@/utils/date"
import { rupees } from "@/utils/format"
import { newClientUuid } from "@/utils/uuid"

import { BookingDetailsCard } from "../components/newbooking/BookingDetailsCard"
import { RoomAndDatesCard } from "../components/newbooking/RoomAndDatesCard"
import { sameUnit } from "../components/UnitPicker"
import {
  buildReservation,
  missingForBooking,
  stayWindow,
  useNewBookingForm,
} from "../hooks/useNewBookingForm"
import type { FreeUnit } from "../types"

/** An advance reservation: guest, dates, room type or particular units, source and details, advance. */
export function NewBookingScreen() {
  const navigation = useAppNavigation()
  const { params } = useAppRoute<"NewBooking">()
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const settings = useSettingsValues()
  const roomTypes = useResource(() => api.rooms.roomTypes(), [], { cacheKey: "roomTypes" })
  const modes = settingList(settings, "payment_modes", ["upi", "cash"])
  const { form, patch } = useNewBookingForm({
    date: params?.date,
    mode: modes[0] ?? "upi",
    roomId: params?.roomId,
    bedId: params?.bedId,
  })
  const [free, setFree] = useState<FreeUnit[]>([])
  const [busy, setBusy] = useState(false)
  const clientUuid = useRef(newClientUuid())

  const consentRequired = settingBool(settings, "consent_required", true)
  const window = stayWindow(
    form,
    settingString(settings, "checkin_time", "12:00"),
    settingString(settings, "checkout_time", "10:00"),
  )
  const nights = Math.max(0, diffInDays(form.arrive, form.depart))
  const missing = missingForBooking(form, consentRequired)
  const isGroup = form.source === "group"

  // Re-ask what is free whenever the dates change, and drop picked units that are no longer free.
  useEffect(() => {
    if (!window || nights <= 0) return setFree([])
    void api.bookings.availability(window.arriveAt, window.departAt).then((r) => {
      const units = r.ok ? r.data : []
      setFree(units)
      patch({ units: form.units.filter((u) => units.some((f) => sameUnit(f, u))) })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window?.arriveAt, window?.departAt])

  const rate = roomTypes.data?.find((t) => t.id === form.roomTypeId)?.baseRatePaise ?? 0
  const total = isGroup
    ? form.units.reduce((sum, u) => sum + (free.find((f) => sameUnit(f, u))?.ratePaise ?? 0), 0) *
      nights
    : rate * nights

  const toggleUnit = (u: FreeUnit) => {
    const key = { roomId: u.roomId, bedId: u.bedId, ratePaise: null }
    const picked = form.units.some((x) => sameUnit(x, key))
    if (isGroup)
      patch({ units: picked ? form.units.filter((x) => !sameUnit(x, key)) : [...form.units, key] })
    else patch({ units: picked ? [] : [key], roomTypeId: u.roomTypeId })
  }

  const submit = async () => {
    if (missing || !window) return
    setBusy(true)
    const result = await api.bookings.reserve(buildReservation(form, window, clientUuid.current))
    setBusy(false)
    if (!result.ok) return showError(result.problem)
    navigation.navigate("Stay", { id: result.data.id })
  }

  return (
    <View style={$fill}>
      <Screen
        preset="scroll"
        safeAreaEdges={["top"]}
        contentContainerStyle={$content}
        keyboardShouldPersistTaps="handled"
      >
        <PageHeader title={translate("booking.new")} onBack={() => navigation.goBack()} />
        <SectionLabel text={translate("checkin.guest")} />
        <Panel>
          <GuestLookup
            phone={form.phone}
            onPhone={(phone) => patch({ phone })}
            name={form.name}
            onName={(name) => patch({ name })}
            guest={form.guest}
            onPick={(guest) => patch({ guest, city: guest?.city ?? form.city })}
          />
        </Panel>
        <SectionLabel
          text={translate("checkin.stepRoom")}
          right={
            nights > 0 ? (
              <KV label="" value={`${nights} × ${rupees(isGroup ? 0 : rate)} = ${rupees(total)}`} />
            ) : undefined
          }
        />
        {!!roomTypes.loading && !roomTypes.data && <Loading rows={1} />}
        <RoomAndDatesCard
          form={form}
          patch={patch}
          roomTypes={roomTypes.data ?? []}
          free={free}
          onToggleUnit={toggleUnit}
        />
        <BookingDetailsCard form={form} patch={patch} />
        <SectionLabel text={translate("checkin.advance")} />
        <Panel>
          <MoneyInput
            label={translate("checkin.advance")}
            value={form.advance}
            onChangeText={(advance) => patch({ advance })}
          />
          <ChoiceChips
            value={form.mode}
            onChange={(mode) => patch({ mode })}
            options={modes.map((m) => ({
              value: m,
              label: translateOr(`option.${m}`, m.toUpperCase()),
            }))}
          />
          {!!consentRequired && (
            <Switch
              value={form.consent}
              onValueChange={(consent) => patch({ consent })}
              label={translate("checkin.consent")}
              labelPosition="right"
            />
          )}
        </Panel>
      </Screen>
      <View
        style={[
          $footer,
          {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <KV label={translate("stay.total")} value={rupees(total)} strong />
        {!!missing && <Banner tone="info" text={translate(missing as "checkin.need.name")} />}
        <Button
          size="lg"
          text={translate("booking.create")}
          onPress={submit}
          disabled={busy || !!missing}
          testID="booking-submit"
        />
      </View>
    </View>
  )
}

const $fill: ViewStyle = { flex: 1 }
const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 24 }
const $footer: ViewStyle = { padding: 12, gap: 8, borderTopWidth: 1 }
