import { useState } from "react"
import { Image, View, type ImageStyle, type ViewStyle } from "react-native"

import {
  Button,
  Chip,
  Empty,
  ErrorState,
  KV,
  ListCard,
  ListRow,
  Loading,
  PageHeader,
  Panel,
  Screen,
  SectionLabel,
  Sheet,
  StatTile,
  showError,
  showToast,
} from "@/components"
import { usePermission } from "@/features/auth/hooks/usePermission"
import { stateLabel, stateTone } from "@/features/bookings/lib/bookingLabels"
import { useResource } from "@/hooks/useResource"
import { translate, translateOr } from "@/i18n/translate"
import { useAppNavigation, useAppRoute } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { formatDate, formatDateTime } from "@/utils/date"
import { formatPhone, rupees } from "@/utils/format"
import { compressImage, takePhoto } from "@/utils/image"

import { GuestEditSheet } from "../components/GuestEditSheet"

/** One guest: stats, current stay, details, photos, every stay and payment. */
export function GuestScreen() {
  const navigation = useAppNavigation()
  const { params } = useAppRoute<"Guest">()
  const { has } = usePermission()
  const profile = useResource(() => api.guests.profile(params.id), [params.id], {
    cacheKey: `guestProfile.${params.id}`,
  })
  const [editing, setEditing] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const p = profile.data
  const g = p?.guest

  const openPhoto = async (kind: "photo" | "id") => {
    const r =
      kind === "photo"
        ? await api.guests.photoUrl(params.id)
        : await api.guests.idPhotoUrl(params.id)
    if (!r.ok) return showError(r.problem)
    setPhotoUrl(r.data.url)
  }
  const capture = async () => {
    const picked = await takePhoto()
    if (!picked) return
    const file = await compressImage(picked, 300)
    const r = await api.guests.uploadPhoto(params.id, file)
    if (!r.ok) return showError(r.problem)
    showToast(translate("action.done"), "ok")
    void profile.reload()
  }

  if (profile.loading && !p)
    return (
      <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={$content}>
        <Loading />
      </Screen>
    )
  if (!p || !g)
    return (
      <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={$content}>
        <PageHeader title={translate("guests.title")} onBack={() => navigation.goBack()} />
        <ErrorState message={profile.problem?.message} onRetry={profile.reload} />
      </Screen>
    )

  return (
    <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={$content}>
      <PageHeader
        title={g.name}
        subtitle={formatPhone(g.phone)}
        onBack={() => navigation.goBack()}
        actions={
          has("reservations.edit") ? (
            <Button
              preset="secondary"
              size="sm"
              text={translate("guests.edit")}
              onPress={() => setEditing(true)}
            />
          ) : undefined
        }
      />
      <View style={$tiles}>
        <StatTile label={translate("guests.visits")} value={p.visits} style={$tile} />
        <StatTile label={translate("res.nights")} value={p.nights} tone="teal" style={$tile} />
        <StatTile
          label={translate("guests.spent")}
          value={rupees(p.spentPaise)}
          tone="ok"
          style={$tile}
        />
        <StatTile
          label={translate("reports.outstanding")}
          value={rupees(p.outstandingPaise)}
          tone={p.outstandingPaise > 0 ? "danger" : "neutral"}
          style={$tile}
        />
      </View>
      {!!p.current && (
        <>
          <SectionLabel text={translate("guests.current")} />
          <ListCard>
            <StayRow s={p.current} last />
          </ListCard>
        </>
      )}
      <SectionLabel text={translate("common.details")} />
      <Panel>
        <KV label={translate("setup.email")} value={g.email ?? "—"} />
        <KV label={translate("checkin.address")} value={g.address || "—"} />
        <KV label={translate("checkin.city")} value={g.city || "—"} />
        <KV label={translate("setup.state")} value={g.state || "—"} />
        <KV label={translate("guests.country")} value={g.country || "—"} />
        <KV label={translate("checkin.nationality")} value={g.nationality || "—"} />
        <KV
          label={translate("checkin.idType")}
          value={`${g.idType ? translateOr(`id.${g.idType}`, g.idType) : "—"}${g.idLast4 ? ` · •••• ${g.idLast4}` : ""}`}
        />
        {!!g.passportNo && <KV label={translate("guests.passport")} value={g.passportNo} />}
        {!!g.notes && <KV label={translate("guests.notes")} value={g.notes} />}
        {has("checkin") && (
          <View style={$actions}>
            {!!g.hasPhoto && (
              <Button
                preset="secondary"
                size="sm"
                text={translate("guests.photo")}
                onPress={() => openPhoto("photo")}
              />
            )}
            {!!g.hasIdPhoto && (
              <Button
                preset="secondary"
                size="sm"
                text={translate("guests.idDocument")}
                onPress={() => openPhoto("id")}
              />
            )}
            <Button
              preset="ghost"
              size="sm"
              text={translate("guests.takePhoto")}
              onPress={capture}
            />
          </View>
        )}
      </Panel>
      <SectionLabel text={translate("guests.stays")} />
      {p.stays.length === 0 ? (
        <Empty />
      ) : (
        <ListCard>
          {p.stays.map((s, i) => (
            <StayRow key={s.bookingId} s={s} last={i === p.stays.length - 1} />
          ))}
        </ListCard>
      )}
      {p.payments.length > 0 && (
        <>
          <SectionLabel text={translate("stay.payments")} />
          <ListCard>
            {p.payments.map((pay, i) => (
              <ListRow
                key={`${pay.receivedAt}-${i}`}
                title={rupees(Math.abs(pay.amountPaise))}
                subtitle={formatDateTime(pay.receivedAt)}
                right={
                  <Chip
                    tone={pay.refund ? "warn" : "neutral"}
                    text={
                      pay.refund
                        ? translate("stay.refund")
                        : translateOr(`option.${pay.mode}`, pay.mode.toUpperCase())
                    }
                  />
                }
                onPress={() => navigation.navigate("Stay", { id: pay.bookingId })}
                last={i === p.payments.length - 1}
              />
            ))}
          </ListCard>
        </>
      )}
      {!!editing && (
        <GuestEditSheet
          guest={g}
          onClose={() => setEditing(false)}
          onSave={async (body) => {
            const r = await api.guests.update(g.id, body)
            if (!r.ok) return showError(r.problem)
            setEditing(false)
            void profile.reload()
          }}
        />
      )}
      <Sheet open={!!photoUrl} onClose={() => setPhotoUrl(null)} title={translate("guests.photo")}>
        {!!photoUrl && (
          <Image
            source={{ uri: photoUrl }}
            style={$photo}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        )}
      </Sheet>
    </Screen>
  )
}

function StayRow({
  s,
  last,
}: {
  s: {
    bookingId: string
    state: import("@/features/bookings/types").BookingState
    arriveAt: string
    departAt: string
    units: string | null
    totalPaise: number
    balancePaise: number
  }
  last: boolean
}) {
  const navigation = useAppNavigation()
  return (
    <ListRow
      title={`${formatDate(s.arriveAt)} → ${formatDate(s.departAt)}`}
      subtitle={`${s.units ?? "—"} · ${rupees(s.totalPaise)}`}
      right={
        <View style={$chips}>
          <Chip tone={stateTone(s.state)} text={stateLabel(s.state)} />
          {s.balancePaise > 0 && <Chip tone="danger" text={rupees(s.balancePaise)} />}
        </View>
      }
      onPress={() => navigation.navigate("Stay", { id: s.bookingId })}
      last={last}
    />
  )
}

const $content: ViewStyle = { padding: 16, gap: 12, paddingBottom: 32 }
const $tiles: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 8 }
const $tile: ViewStyle = { flexBasis: "47%", flexGrow: 1 }
const $actions: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }
const $chips: ViewStyle = { alignItems: "flex-end", gap: 4 }
const $photo: ImageStyle = { width: "100%", height: 360, borderRadius: 12 }
