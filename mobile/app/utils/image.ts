/**
 * Photos: pick or capture, then shrink to the size the server accepts. The only file that imports
 * expo-image-picker and expo-image-manipulator.
 */
import * as ImageManipulator from "expo-image-manipulator"
import * as ImagePicker from "expo-image-picker"

export type PickedImage = { uri: string; width: number; height: number }
export type PickedFile = { uri: string; name: string; mimeType: string }

/** Open the camera; null when the user cancelled or refused permission. */
export async function takePhoto(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync()
  if (!permission.granted) return null
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 })
  return firstAsset(result)
}

/** Open the gallery; null when cancelled. */
export async function pickPhoto(): Promise<PickedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 })
  return firstAsset(result)
}

/**
 * Re-encode as JPEG under `maxKb`, scaling the longest edge to `maxEdge` first and lowering quality in the
 * same steps as the web (0.8, 0.65, 0.5, 0.4). Returns the last attempt even when still over.
 */
export async function compressImage(
  image: PickedImage,
  maxKb: number,
  maxEdge = 1600,
): Promise<PickedFile> {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))
  const resize = scale < 1 ? [{ resize: { width: Math.round(image.width * scale) } }] : []
  let out: { uri: string } = image
  for (const compress of [0.8, 0.65, 0.5, 0.4]) {
    out = await ImageManipulator.manipulateAsync(image.uri, resize, {
      compress,
      format: ImageManipulator.SaveFormat.JPEG,
    })
    const size = await fileSizeKb(out.uri)
    if (size !== null && size <= maxKb) break
  }
  return { uri: out.uri, name: "photo.jpg", mimeType: "image/jpeg" }
}

/** Size in KB via a HEAD-style fetch of the local file; null when unknown. */
export async function fileSizeKb(uri: string): Promise<number | null> {
  try {
    const res = await fetch(uri)
    const blob = await res.blob()
    return blob.size / 1024
  } catch {
    return null
  }
}

function firstAsset(result: ImagePicker.ImagePickerResult): PickedImage | null {
  if (result.canceled || !result.assets?.[0]) return null
  const a = result.assets[0]
  return { uri: a.uri, width: a.width, height: a.height }
}
