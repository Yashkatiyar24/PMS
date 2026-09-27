import { useRef, useState } from "react"
import { View, type ViewStyle } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Banner, Button, KV, Loading, PageHeader, Screen, showError } from "@/components"
import { SelfRegistrationQr } from "@/features/guests/components/SelfRegistrationQr"
import { writeOrQueue, wasQueued } from "@/features/offline/queueWrite"
import { useSettingsValues } from "@/features/settings/hooks/useSettingsValues"
import { settingBool, settingList, settingNumber } from "@/features/settings/types"
import { useResource } from "@/hooks/useResource"
import { translate } from "@/i18n/translate"
import { useAppNavigation, useAppRoute } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { useAppTheme } from "@/theme/context"
import { rupees, toPaise } from "@/utils/format"
import { newClientUuid } from "@/utils/uuid"

import { GuestStep } from "../components/checkin/GuestStep"
import { PaymentStep } from "../components/checkin/PaymentStep"
import { RoomStep, rateFor } from "../components/checkin/RoomStep"
import { missingStep, useCheckInForm } from "../hooks/useCheckInForm"
import { buildCheckInRequest } from "../lib/checkInRequest"

/** Walk-in check-in in three steps, with the guest able to fill their own details by QR. Queued when offline. */
export function CheckInScreen() {
  const navigation = useAppNavigation()
  const { params } = useAppRoute<"CheckIn">()
  const { theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const settings = useSettingsValues()
  const rooms = useResource(() => api.rooms.rooms(), [], { cacheKey: "rooms" })
  const roomTypes = useResource(() => api.rooms.roomTypes(), [], { cacheKey: "roomTypes" })
  const modes = settingList(settings, "payment_modes", ["cash", "upi"])
  const { form, patch, applySubmission } = useCheckInForm({
    depositPaise: settingNumber(settings, "deposit_default_paise", 0),
    mode: modes[0] ?? "cash",
  })
  const [busy, setBusy] = useState(false)
  const opened = useRef(Date.now())
  const clientUuid = useRef(newClientUuid())

  const rules = {
    consentRequired: settingBool(settings, "consent_required", true),
    photoRequired: settingBool(settings, "id_photo_required", true),
  }
  const maxPhotoKb = settingNumber(settings, "id_photo_max_kb", 300)
  const rate = rateFor(form, roomTypes.data ?? [])
  const total = rate * form.nights
  const missing = missingStep(form, rules)

  // A room/bed tapped on the tape chart arrives preselected.
  if (params?.roomId && !form.unit && rooms.data && roomTypes.data) {
    const room = rooms.data.find((r) => r.id === params.roomId)
    if (room)
      patch({
        roomTypeId: room.roomTypeId,
        unit: { roomId: room.id, bedId: params.bedId ?? null, ratePaise: null },
        unitLabel: room.number,
      })
  }

  const submit = async () => {
    if (missing || !form.unit) return
    setBusy(true)
    let guestId = form.guest?.id ?? null
    // The guest's own submission becomes the guest record first (offline: the check-in still queues with newGuest).
    if (!guestId && form.registration) {
      const applied = await api.guests.applyRegistration(
        form.registration.id,
        buildCheckInRequest(form, clientUuid.current).newGuest,
      )
      if (applied.ok) guestId = applied.data.guestId
    }
    if (form.photo && guestId) await api.guests.uploadIdPhoto(guestId, form.photo)
    const body = {
      ...buildCheckInRequest(form, clientUuid.current),
      guestId,
      newGuest: guestId ? null : buildCheckInRequest(form, clientUuid.current).newGuest,
    }
    const result = await writeOrQueue(() => api.bookings.checkIn(body), {
      clientUuid: clientUuid.current,
      path: "/api/bookings/check-in",
      body,
    })
    setBusy(false)
    if (wasQueued(result)) return navigation.goBack()
    if (!result.ok) return showError(result.problem)
    if (form.photo && !guestId) await api.guests.uploadIdPhoto(result.data.guestId, form.photo)
    navigation.navigate("Stay", {
      id: result.data.id,
      checkedInSeconds: Math.round((Date.now() - opened.current) / 1000),
    })
  }

  const loading = !rooms.data || !roomTypes.data
  return (
    <View style={$fill}>
      <Screen
        preset="scroll"
        safeAreaEdges={["top"]}
        contentContainerStyle={$content}
        keyboardShouldPersistTaps="handled"
      >
        <PageHeader title={translate("action.checkIn")} onBack={() => navigation.goBack()} />
        {!!form.registration && (
          <Banner tone="ok" text={translate("selfreg.received", { name: form.name })} />
        )}
        {settingBool(settings, "self_registration_enabled", true) && !form.registration && (
          <SelfRegistrationQr onReceived={applySubmission} />
        )}
        {!!loading && <Loading />}
        {!loading && (
          <>
            <GuestStep
              form={form}
              patch={patch}
              photoRequired={rules.photoRequired}
              maxPhotoKb={maxPhotoKb}
            />
            <RoomStep
              form={form}
              patch={patch}
              rooms={rooms.data ?? []}
              roomTypes={roomTypes.data ?? []}
            />
            <PaymentStep
              form={form}
              patch={patch}
              modes={modes}
              consentRequired={rules.consentRequired}
              totalPaise={total}
            />
          </>
        )}
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
        <KV
          label={translate("checkin.total")}
          value={`${rupees(total)}${form.unitLabel ? ` · ${form.unitLabel}` : ""}`}
          strong
        />
        {!!missing && <Banner tone="info" text={translate(missing as "checkin.need.name")} />}
        <Button
          size="lg"
          text={translate("checkin.submit")}
          onPress={submit}
          disabled={busy || !!missing || toPaise(form.advance) < 0}
          testID="checkin-submit"
        />
      </View>
    </View>
  )
}

const $fill: ViewStyle = { flex: 1 }
const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 24 }
const $footer: ViewStyle = { padding: 12, gap: 8, borderTopWidth: 1 }
