import * as Device from "expo-device"

/** What the sessions list shows for this phone, e.g. "Pixel 8 · Android". Trimmed to the server's 80 chars. */
export function deviceName(): string {
  const parts = [Device.modelName, Device.osName].filter(Boolean)
  return (parts.join(" · ") || "Mobile").slice(0, 80)
}
