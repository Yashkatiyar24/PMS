import { useState } from "react"

import { Button, ChoiceChips, Input, Sheet, showError } from "@/components"
import { translate } from "@/i18n/translate"
import { api } from "@/services/api"

import { OTA_CHANNELS, type ChannelLink } from "../types"

const BRANDS: Record<string, string> = {
  airbnb: "Airbnb",
  booking_com: "Booking.com",
  makemytrip: "MakeMyTrip",
  agoda: "Agoda",
  expedia: "Expedia",
}
/** The OTA's display name. */
export const brand = (c: string) => BRANDS[c] ?? translate("channels.other")

/** Link a room to an OTA calendar, or change the address it imports from. */
export function LinkSheet({
  link,
  rooms,
  onClose,
  onDone,
}: {
  link: ChannelLink | null
  rooms: { id: string; number: string; typeName: string }[]
  onClose: () => void
  onDone: () => void
}) {
  const [roomId, setRoomId] = useState<string | null>(link?.roomId ?? null)
  const [channel, setChannel] = useState<string>(link?.channel ?? "airbnb")
  const [url, setUrl] = useState(link?.importUrl ?? "")
  const submit = async () => {
    const r = link
      ? await api.settings.updateChannelUrl(link.id, url.trim() || null)
      : await api.settings.linkChannel(roomId!, channel, url.trim() || null)
    if (!r.ok) return showError(r.problem)
    onDone()
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={link ? translate("channels.editUrl") : translate("channels.add")}
      footer={
        <Button
          size="lg"
          text={translate("action.save")}
          onPress={submit}
          disabled={!link && !roomId}
        />
      }
    >
      {!link && (
        <ChoiceChips
          value={roomId}
          onChange={setRoomId}
          options={rooms.map((r) => ({ value: r.id, label: `${r.number} · ${r.typeName}` }))}
        />
      )}
      {!link && (
        <ChoiceChips
          value={channel}
          onChange={setChannel}
          options={OTA_CHANNELS.map((c) => ({ value: c, label: brand(c) }))}
        />
      )}
      <Input
        label={translate("channels.importUrl")}
        hint={translate("channels.importHint")}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        keyboardType="url"
      />
    </Sheet>
  )
}
