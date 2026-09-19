"use client"

/**
 * One box that finds a stay by guest name, phone number or booking reference. Results appear as you type
 * (after a short pause, so a fast typist sends one request, not ten); Enter opens the first one.
 */
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { clsx } from "clsx"
import { api } from "@/lib/api"
import { formatDate } from "@/lib/format"
import type { BookingState } from "@/lib/types"
import { useI18n } from "@/i18n"
import { Chip, type Tone } from "./ui"

type Hit = { id: string; state: BookingState; arriveAt: string; departAt: string; guestName: string; phone: string; units: string | null }
const TONE: Record<BookingState, Tone> = { pending: "warn", reserved: "brand", checked_in: "ok", checked_out: "neutral", no_show: "danger", cancelled: "neutral" }

export function SearchBox({ autoFocus, onDone, className }: { autoFocus?: boolean; onDone?: () => void; className?: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [open, setOpen] = useState(false)

  // The search endpoint is the external system here: ask it once the typing pauses.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    let live = true
    const timer = setTimeout(() => {
      api<Hit[]>(`/api/bookings/search?q=${encodeURIComponent(q)}`)
        .then((found) => { if (live) setHits(found) })
        .catch(() => { if (live) setHits([]) })
    }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [query])

  function go(hit: Hit) {
    setOpen(false)
    setQuery("")
    setHits(null)
    onDone?.()
    router.push(`/stays/${hit.id}`)
  }

  const shown = query.trim().length >= 2 ? hits : null

  return (
    <div className={clsx("relative", className)}>
      <label className="relative block">
        <span className="sr-only">{t("search.placeholder")}</span>
        <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          type="search"
          value={query}
          autoFocus={autoFocus}
          placeholder={t("search.placeholder")}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && shown?.[0]) go(shown[0])
            if (e.key === "Escape") setOpen(false)
          }}
          className="!rounded-full !border-line !bg-surface-2 !pl-10"
        />
      </label>
      {open && shown && (
        <ul className="anim-pop absolute inset-x-0 top-full z-40 mt-2 max-h-[60vh] overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-[var(--shadow-pop)]">
          {shown.length === 0 ? (
            <li className="px-3 py-3 text-sm text-ink-soft">{t("search.none")}</li>
          ) : shown.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(hit)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{hit.guestName}</span>
                  <span className="block truncate text-xs text-ink-soft">
                    {hit.id.slice(0, 8).toUpperCase()} · {hit.units ?? "—"} · {formatDate(hit.arriveAt)} → {formatDate(hit.departAt)}
                  </span>
                </span>
                <Chip tone={TONE[hit.state]} dot>{t(`state.${hit.state}` as "state.reserved")}</Chip>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
