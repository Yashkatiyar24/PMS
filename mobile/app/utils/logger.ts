/** The one place that logs. Screens never call `console` directly. */

type Level = "debug" | "info" | "warn" | "error"

const enabled = typeof __DEV__ !== "undefined" && __DEV__

function write(level: Level, message: string, detail?: unknown): void {
  if (!enabled && level !== "error") return
  const line = `[pms] ${message}`
  if (level === "error") console.error(line, detail ?? "")
  else if (level === "warn") console.warn(line, detail ?? "")
  else console.log(line, detail ?? "")
}

/** Development-only trace. */
export function logDebug(message: string, detail?: unknown): void {
  write("debug", message, detail)
}

/** Development-only note. */
export function logInfo(message: string, detail?: unknown): void {
  write("info", message, detail)
}

/** Something recoverable happened. */
export function logWarn(message: string, detail?: unknown): void {
  write("warn", message, detail)
}

/** Something failed; always recorded. */
export function logError(message: string, detail?: unknown): void {
  write("error", message, detail)
}
