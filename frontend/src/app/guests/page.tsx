"use client"

/** Every guest this property has had, newest first; one box finds them by name, phone, city or email. */
import { useEffect, useState } from "react"
import { Search, UserRound } from "lucide-react"
import { api } from "@/lib/api"
import type { Guest } from "@/lib/types"
import { useI18n } from "@/i18n"
import { Avatar, Empty, ListCard, ListRow, Loading, PageHeader } from "@/components/ui"

export default function GuestsPage() {
  const { t } = useI18n()
  const [query, setQuery] = useState("")
  const [guests, setGuests] = useState<Guest[] | null>(null)

  // Ask once the typing pauses, so a fast typist sends one request, not ten.
  useEffect(() => {
    let live = true
    const timer = setTimeout(() => {
      api<Guest[]>(`/api/guests?q=${encodeURIComponent(query.trim())}`)
        .then((found) => { if (live) setGuests(found) })
        .catch(() => { if (live) setGuests([]) })
    }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [query])

  return (
    <div className="space-y-4">
      <PageHeader title={t("guests.title")} back="/settings" />
      <label className="relative block md:max-w-md">
        <span className="sr-only">{t("guests.search")}</span>
        <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("guests.search")} className="!rounded-full !pl-10" autoFocus />
      </label>
      {guests === null ? <Loading /> : guests.length === 0 ? <Empty icon={UserRound}>{t("search.none")}</Empty> : (
        <ListCard>
          {guests.map((g) => (
            <ListRow key={g.id} href={`/guests/${g.id}`} leading={<Avatar name={g.name} size={38} />} title={g.name}
              subtitle={[g.phone, g.city, g.email].filter(Boolean).join(" · ")} />
          ))}
        </ListCard>
      )}
    </div>
  )
}
