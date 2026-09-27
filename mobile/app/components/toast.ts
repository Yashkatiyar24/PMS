/**
 * The one toast helper. Screens call `showToast` / `showError`; `ToastHost` at the root renders them.
 * A tiny listener store, no library.
 */
import { translate } from "@/i18n/translate"
import type { ApiProblem } from "@/services/api"

export type ToastTone = "info" | "ok" | "warn" | "danger"
export type Toast = { id: number; tone: ToastTone; text: string }

type Listener = (toasts: Toast[]) => void

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<Listener>()

function emit() {
  listeners.forEach((l) => l(toasts))
}

/** Show a message for a few seconds. */
export function showToast(text: string, tone: ToastTone = "info", ms = 2500): void {
  const toast = { id: nextId++, tone, text }
  toasts = [...toasts, toast]
  emit()
  setTimeout(() => dismissToast(toast.id), ms)
}

/** Show an API problem in the desk's words: the server message when there is one, else the generic error. */
export function showError(problem: ApiProblem | string | null | undefined): void {
  if (typeof problem === "string") return showToast(problem, "danger", 3500)
  if (!problem) return showToast(translate("error.generic"), "danger", 3500)
  if (problem.kind === "cannot-connect" || problem.kind === "timeout")
    return showToast(translate("mobile.offlineTitle"), "warn", 3500)
  showToast(problem.message || translate("error.generic"), "danger", 3500)
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  listener(toasts)
  return () => {
    listeners.delete(listener)
  }
}
