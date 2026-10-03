/** Saving and sharing files the API hands back (CSV exports, PDFs). The only file importing expo-file-system/sharing. */
import { File, Paths } from "expo-file-system"
import * as Sharing from "expo-sharing"

/** Write text to the cache directory and open the share sheet. */
export async function shareText(
  filename: string,
  text: string,
  mimeType = "text/csv",
): Promise<void> {
  const file = new File(Paths.cache, filename)
  if (file.exists) file.delete()
  file.create()
  file.write(text)
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename })
}

/** Write bytes to the cache directory and open the share sheet. */
export async function shareBytes(
  filename: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<void> {
  const file = new File(Paths.cache, filename)
  if (file.exists) file.delete()
  file.create()
  file.write(bytes)
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename })
}
