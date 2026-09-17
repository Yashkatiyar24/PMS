/**
 * The guest's phone talking to the backend, with no account and no session.
 *
 * Kept apart from `api.ts` on purpose. That client sends the session cookie, treats a 401 as "you have been
 * signed out" and pushes the browser to the login screen — all correct for the desk, all wrong for a guest,
 * who has no login to go back to. Nothing here sends credentials or redirects anywhere.
 */
import { API_BASE } from "./api"

export class PublicApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const problem = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new PublicApiError(res.status, problem.error ?? `HTTP ${res.status}`)
  }
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export async function getForm<T>(token: string): Promise<T> {
  return unwrap<T>(await fetch(`${API_BASE}/api/public/registration/${encodeURIComponent(token)}`))
}

export async function submitForm<T>(token: string, body: unknown): Promise<T> {
  return unwrap<T>(
    await fetch(`${API_BASE}/api/public/registration/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  )
}

export async function uploadPhoto(token: string, file: File): Promise<void> {
  const form = new FormData()
  form.append("file", file)
  await unwrap<unknown>(
    await fetch(`${API_BASE}/api/public/registration/${encodeURIComponent(token)}/photo`, {
      method: "POST",
      body: form,
    }),
  )
}
