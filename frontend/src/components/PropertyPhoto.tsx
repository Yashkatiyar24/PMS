"use client"

/**
 * The property's photograph: what guests see at the top of the booking page and what the platform sees in
 * its back office. One card serves the owner's settings and the platform's property page, so the two never
 * drift apart. The photo is shrunk on the device before it is sent, as ID photos are.
 */
import { useRef, useState } from "react"
import { Camera, ImageOff, Trash2 } from "lucide-react"
import { compressImage } from "@/lib/image"
import { useI18n } from "@/i18n"
import { Button, Card } from "@/components/ui"

export function PropertyPhoto({
  url,
  onUpload,
  onRemove,
  busy,
}: {
  url: string | null
  onUpload: (photo: Blob) => Promise<void>
  onRemove: () => Promise<void>
  busy?: boolean
}) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const [working, setWorking] = useState(false)
  const disabled = busy || working

  async function pick(file: File | undefined) {
    if (!file) return
    setWorking(true)
    try {
      await onUpload(await compressImage(file, 600, 1600))
    } finally {
      setWorking(false)
      if (input.current) input.current.value = ""
    }
  }

  async function remove() {
    setWorking(true)
    try { await onRemove() } finally { setWorking(false) }
  }

  const choose = <Camera size={16} aria-hidden />

  return (
    <Card
      title={t("property.photo")}
      action={url ? (
        <span className="flex gap-1">
          <Button size="sm" variant="secondary" disabled={disabled} onClick={() => input.current?.click()}>{choose} {t("property.changePhoto")}</Button>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={remove} aria-label={t("property.removePhoto")} title={t("property.removePhoto")}><Trash2 size={16} aria-hidden /></Button>
        </span>
      ) : undefined}
    >
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      {url ? (
        // A plain <img>: the link is signed and short-lived, so there is nothing for next/image to optimise or cache.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={t("property.photo")} className="aspect-[16/9] w-full rounded-xl bg-surface-2 object-cover" />
      ) : (
        <div className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 p-4 text-center">
          <ImageOff size={24} aria-hidden className="text-ink-faint" />
          <p className="text-sm text-ink-soft">{t("property.noPhoto")}</p>
          <Button size="sm" variant="secondary" disabled={disabled} onClick={() => input.current?.click()}>{choose} {t("property.addPhoto")}</Button>
        </div>
      )}
      <p className="mt-2 text-xs text-ink-faint">{t("property.photoHint")}</p>
    </Card>
  )
}
