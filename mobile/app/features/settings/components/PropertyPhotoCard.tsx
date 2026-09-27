import { useState } from "react"
import { Image, View, type ImageStyle, type ViewStyle } from "react-native"

import { Button, Panel, Text, showError } from "@/components"
import { translate } from "@/i18n/translate"
import type { ApiResult } from "@/services/api"
import { useAppTheme } from "@/theme/context"
import { compressImage, pickPhoto, takePhoto, type PickedFile } from "@/utils/image"

export type PropertyPhotoCardProps<T> = {
  photoUrl: string | null | undefined
  upload: (file: PickedFile) => Promise<ApiResult<T>>
  remove: () => Promise<ApiResult<T>>
  /** The saved record the server returns after either call. */
  onSaved: (saved: T) => void
}

/**
 * The property's photo: camera or gallery, compressed on the phone to the same 600 KB / 1600 px the web sends,
 * and a remove. Used by the property's own settings and by the platform admin.
 */
export function PropertyPhotoCard<T>({
  photoUrl,
  upload,
  remove,
  onSaved,
}: PropertyPhotoCardProps<T>) {
  const { theme } = useAppTheme()
  const [busy, setBusy] = useState(false)
  const act = async (call: () => Promise<ApiResult<T> | null>) => {
    setBusy(true)
    const r = await call()
    setBusy(false)
    if (!r) return
    if (!r.ok) return showError(r.problem)
    onSaved(r.data)
  }
  const add = (source: "camera" | "gallery") =>
    act(async () => {
      const picked = source === "camera" ? await takePhoto() : await pickPhoto()
      return picked ? upload(await compressImage(picked, 600, 1600)) : null
    })

  return (
    <Panel>
      <Text
        text={translate("property.photo")}
        weight="bold"
        size="sm"
        style={{ color: theme.colors.text }}
      />
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={$photo} accessibilityIgnoresInvertColors />
      ) : (
        <Text
          text={translate("property.noPhoto")}
          size="xs"
          style={{ color: theme.colors.textDim }}
        />
      )}
      <Text
        text={translate("property.photoHint")}
        size="xxs"
        style={{ color: theme.colors.textFaint }}
      />
      <View style={$row}>
        <Button
          preset="secondary"
          size="sm"
          text={translate("mobile.camera")}
          disabled={busy}
          onPress={() => void add("camera")}
        />
        <Button
          preset="secondary"
          size="sm"
          text={translate("mobile.gallery")}
          disabled={busy}
          onPress={() => void add("gallery")}
        />
        {photoUrl && (
          <Button
            preset="ghost"
            size="sm"
            text={translate("property.removePhoto")}
            disabled={busy}
            onPress={() => void act(remove)}
          />
        )}
      </View>
    </Panel>
  )
}

const $row: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 8 }
const $photo: ImageStyle = { width: "100%", aspectRatio: 16 / 9, borderRadius: 12 }
