"use client"

/**
 * What the ID photo said about one field, under the field itself.
 *
 * Three states, and the difference matters: the reader agreed with what is in the box (a quiet tick), the
 * reader is not sure (an amber "please check", because treating a guess as read is how a register ends up
 * with a wrong name), or the reader read something else (offered as a button, never applied on its own).
 *
 * Used by the desk's screen and the guest's phone alike, which is why the labels are passed in — the guest's
 * phone carries its own Hindi and English and does not load the app's dictionary.
 */
import { Check, Sparkles, TriangleAlert } from "lucide-react"
import { LOW_CONFIDENCE, type Suggestion } from "@/lib/checkin-fields"

export function OcrSuggestion({
  suggestion, current, onUse, labels,
}: {
  suggestion: Suggestion | undefined
  current: string
  onUse: () => void
  labels: { read: string; verify: string; use: string }
}) {
  if (!suggestion) return null
  const matches = suggestion.value === current.trim()
  const unsure = suggestion.confidence < LOW_CONFIDENCE

  if (matches) {
    return unsure ? (
      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-warn">
        <TriangleAlert size={13} aria-hidden /> {labels.verify}
      </p>
    ) : (
      <p className="mt-1 flex items-center gap-1 text-xs text-ok">
        <Check size={13} aria-hidden /> {labels.read}
      </p>
    )
  }
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
      <Sparkles size={13} aria-hidden className={unsure ? "text-warn" : "text-brand"} />
      <span className="truncate">{labels.read}: <b className="font-semibold">{suggestion.value}</b></span>
      <button type="button" onClick={onUse} className="rounded-full bg-brand-soft px-2 py-0.5 font-semibold text-brand-ink">
        {labels.use}
      </button>
    </p>
  )
}
