import { useEffect, useState } from "react"

import { Avatar, Chip, Empty, Input, ListCard, ListRow, Sheet } from "@/components"
import { translate } from "@/i18n/translate"
import { useAppNavigation } from "@/navigators/useAppNavigation"
import { api } from "@/services/api"
import { formatDate } from "@/utils/date"
import { reference } from "@/utils/format"

import { stateTone } from "../lib/bookingLabels"
import type { SearchHit } from "../types"

/** Global booking search: name, phone (≥4 digits) or reference; ≥2 characters, debounced 250 ms. */
export function BookingSearchSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigation = useAppNavigation()
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<SearchHit[] | null>(null)

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits(null)
      return
    }
    const timer = setTimeout(async () => {
      const result = await api.bookings.search(q.trim())
      setHits(result.ok ? result.data : [])
    }, 250)
    return () => clearTimeout(timer)
  }, [q])

  const openStay = (id: string) => {
    onClose()
    setQ("")
    navigation.navigate("Stay", { id })
  }

  return (
    <Sheet open={open} onClose={onClose} title={translate("mobile.searchBookings")}>
      <Input
        value={q}
        onChangeText={setQ}
        placeholder={translate("search.placeholder")}
        autoFocus
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={() => hits?.[0] && openStay(hits[0].id)}
        testID="search-input"
      />
      {hits && hits.length === 0 && <Empty text={translate("search.none")} />}
      {hits && hits.length > 0 && (
        <ListCard>
          {hits.map((h, i) => (
            <ListRow
              key={h.id}
              leading={<Avatar name={h.guestName} tone={stateTone(h.state)} />}
              title={h.guestName}
              subtitle={`${reference(h.id)} · ${h.units} · ${formatDate(h.arriveAt)} → ${formatDate(h.departAt)}`}
              right={
                <Chip
                  tone={stateTone(h.state)}
                  text={translate(`state.${h.state}` as "state.reserved")}
                />
              }
              onPress={() => openStay(h.id)}
              last={i === hits.length - 1}
            />
          ))}
        </ListCard>
      )}
    </Sheet>
  )
}
