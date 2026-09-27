import { useState } from "react"
import { View, type ViewStyle } from "react-native"

import { Button, Chip, Input, ListCard, ListRow } from "@/components"
import { translate } from "@/i18n/translate"
import { api } from "@/services/api"
import { digitsOnly } from "@/utils/format"

import type { Guest } from "../types"

export type GuestLookupProps = {
  phone: string
  onPhone: (phone: string) => void
  name: string
  onName: (name: string) => void
  /** The guest picked from the register, or null for a new one. */
  guest: Guest | null
  onPick: (guest: Guest | null) => void
}

/** Phone → matching guests in the register → prefilled name; typing a new name means a new guest. */
export function GuestLookup({ phone, onPhone, name, onName, guest, onPick }: GuestLookupProps) {
  const [matches, setMatches] = useState<Guest[]>([])
  const [searching, setSearching] = useState(false)

  const lookup = async () => {
    const digits = digitsOnly(phone)
    if (digits.length < 4) return
    setSearching(true)
    const result = await api.guests.byPhone(digits)
    setSearching(false)
    setMatches(result.ok ? result.data : [])
  }

  const pick = (g: Guest) => {
    onPick(g)
    onName(g.name)
    onPhone(g.phone)
    setMatches([])
  }

  return (
    <View style={$wrap}>
      <Input
        label={translate("checkin.phoneLookup")}
        value={phone}
        onChangeText={(t) => {
          onPhone(digitsOnly(t).slice(0, 12))
          if (guest) onPick(null)
        }}
        onBlur={lookup}
        keyboardType="phone-pad"
        maxLength={12}
        testID="guest-phone"
        right={
          <Button
            preset="ghost"
            size="sm"
            text={translate("action.search")}
            onPress={lookup}
            disabled={searching}
          />
        }
      />
      {matches.length > 0 && (
        <ListCard>
          {matches.map((g, i) => (
            <ListRow
              key={g.id}
              title={g.name}
              subtitle={g.city}
              onPress={() => pick(g)}
              last={i === matches.length - 1}
            />
          ))}
        </ListCard>
      )}
      <Input
        label={translate("checkin.name")}
        value={name}
        onChangeText={(t) => {
          onName(t)
          if (guest && t !== guest.name) onPick(null)
        }}
        autoCapitalize="words"
        testID="guest-name"
        right={guest ? <Chip tone="ok" text={translate("checkin.guest")} /> : undefined}
      />
    </View>
  )
}

const $wrap: ViewStyle = { gap: 10 }
