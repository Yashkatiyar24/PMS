/**
 * Shrinks an ID photo on the phone before it is uploaded.
 *
 * The desk is on patchy 4G, so sending a 4MB camera image is the difference between a 60-second check-in and
 * a minute of waiting. Quality steps down until the file fits the property's limit.
 */
export async function compressImage(file: File, maxKb: number, maxEdge = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)

  const context = canvas.getContext("2d")
  if (!context) return file
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  for (const quality of [0.8, 0.65, 0.5, 0.4]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality))
    if (blob && blob.size <= maxKb * 1024) return blob
    if (quality === 0.4 && blob) return blob
  }
  return file
}
