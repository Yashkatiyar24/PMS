import { useState } from "react"
import { View, type ViewStyle } from "react-native"

import { Button, Chip, Text, showError } from "@/components"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { compressImage, fileSizeKb, pickPhoto, takePhoto, type PickedFile } from "@/utils/image"
import { readIdFromPhoto, type IdRead } from "@/utils/ocr"

export type IdPhotoFieldProps = {
  photo: PickedFile | null
  onPhoto: (photo: PickedFile | null) => void
  /** Compress to at most this many KB (the property's `id_photo_max_kb`). */
  maxKb: number
  label?: string
  /** When given, the ID number is read off the photo on this phone and its last four handed back. */
  onIdRead?: (read: IdRead) => void
}

/** Camera or gallery → compressed JPEG ready to upload, and optionally the ID read off it. Shows its size once taken. */
export function IdPhotoField({ photo, onPhoto, maxKb, label, onIdRead }: IdPhotoFieldProps) {
  const { theme } = useAppTheme()
  const [busy, setBusy] = useState(false)
  const [sizeKb, setSizeKb] = useState<number | null>(null)

  const capture = async (source: "camera" | "gallery") => {
    setBusy(true)
    try {
      const picked = source === "camera" ? await takePhoto() : await pickPhoto()
      if (!picked) return
      const file = await compressImage(picked, maxKb)
      setSizeKb(await fileSizeKb(file.uri))
      onPhoto(file)
      // The full-size shot reads better than the compressed upload; it stays on the phone either way.
      if (onIdRead) {
        const read = await readIdFromPhoto(picked.uri)
        if (read) onIdRead(read)
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={$wrap}>
      <Text
        text={label ?? translate("checkin.idPhoto")}
        size="xs"
        weight="bold"
        style={{ color: theme.colors.text }}
      />
      <View style={$row}>
        <Button
          preset="secondary"
          size="sm"
          text={translate("mobile.camera")}
          onPress={() => capture("camera")}
          disabled={busy}
        />
        <Button
          preset="ghost"
          size="sm"
          text={translate("mobile.gallery")}
          onPress={() => capture("gallery")}
          disabled={busy}
        />
        {!!photo && <Chip tone="ok" text={sizeKb ? `${Math.round(sizeKb)} KB` : "✓"} />}
        {!!photo && (
          <Button
            preset="ghost"
            size="sm"
            text={translate("action.remove")}
            onPress={() => onPhoto(null)}
          />
        )}
      </View>
    </View>
  )
}

const $wrap: ViewStyle = { gap: 6 }
const $row: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }
