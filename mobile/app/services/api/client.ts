/**
 * The one HTTP client. Adds the session cookie and the CSRF header, turns every response into an `ApiResult`,
 * and tells the auth store when the server says the session is gone.
 */
import { Platform } from "react-native"
import { ApisauceInstance, create } from "apisauce"

import Config from "@/config"
import {
  BROWSER_SESSION,
  cookieHeader,
  cookieOwnedByPlatform,
  tokenFromSetCookie,
} from "@/utils/auth"
import { logWarn } from "@/utils/logger"

import { badData, problemFrom, type ApiProblem } from "./problem"
import { fail, ok, type ApiResult } from "./result"

export type Query = Record<string, string | number | boolean | null | undefined>
export type UploadFile = { uri: string; name: string; mimeType: string }

const CSRF_HEADER = { "X-Requested-With": "pms" }

export class ApiClient {
  readonly http: ApisauceInstance
  private token: string | null = null
  private onUnauthorized: (() => void) | null = null

  constructor(baseURL: string = Config.API_URL, timeout: number = Config.API_TIMEOUT_MS) {
    this.http = create({
      baseURL,
      timeout,
      headers: { Accept: "application/json" },
      // A browser sends its own cookie only when asked to; on a phone the transform below adds it.
      withCredentials: cookieOwnedByPlatform(),
    })
    this.http.addRequestTransform((request) => {
      const cookie = cookieHeader(this.token)
      request.headers = request.headers ?? {}
      if (cookie) request.headers.Cookie = cookie
      if (request.method && request.method.toUpperCase() !== "GET")
        Object.assign(request.headers, CSRF_HEADER)
    })
  }

  /** The session token to send; null when signed out. */
  setToken(token: string | null): void {
    this.token = token
  }

  /** Called once per 401 so the app can return to the login screen. */
  setUnauthorizedHandler(handler: (() => void) | null): void {
    this.onUnauthorized = handler
  }

  get<T>(path: string, query?: Query): Promise<ApiResult<T>> {
    return this.run<T>((config) => this.http.get<T>(path, clean(query), config))
  }

  post<T>(path: string, body?: unknown, query?: Query): Promise<ApiResult<T>> {
    return this.run<T>((config) =>
      this.http.post<T>(path, body ?? {}, { params: clean(query), ...config }),
    )
  }

  put<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
    return this.run<T>((config) => this.http.put<T>(path, body ?? {}, config))
  }

  patch<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
    return this.run<T>((config) => this.http.patch<T>(path, body ?? {}, config))
  }

  delete<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
    return this.run<T>((config) =>
      this.http.delete<T>(path, undefined, {
        ...(body === undefined ? {} : { data: body }),
        ...config,
      }),
    )
  }

  /** A multipart upload with a single part named `file`, never queued. */
  async upload<T>(path: string, file: UploadFile): Promise<ApiResult<T>> {
    const form = new FormData()
    if (Platform.OS === "web") {
      // A browser needs the bytes as a Blob; it fills in the multipart boundary itself.
      form.append("file", await (await fetch(file.uri)).blob(), file.name)
    } else {
      form.append("file", {
        uri: file.uri,
        name: file.name,
        type: file.mimeType,
      } as unknown as Blob)
    }
    // Overrides apisauce's JSON default, which would otherwise serialise the form as JSON.
    return this.run<T>((config) =>
      this.http.post<T>(path, form, {
        headers: { "Content-Type": "multipart/form-data" },
        ...config,
      }),
    )
  }

  /** Fetch text (HTML receipts, CSV exports). */
  async getText(path: string, query?: Query): Promise<ApiResult<string>> {
    const response = await this.http.get<string>(path, clean(query), {
      responseType: "text",
      headers: { Accept: "*/*" },
    })
    const problem = problemFrom(response)
    if (problem) return this.failed(problem)
    return ok(typeof response.data === "string" ? response.data : String(response.data ?? ""))
  }

  /** Fetch bytes (PDF receipts). */
  async getBytes(path: string, query?: Query): Promise<ApiResult<Uint8Array>> {
    const response = await this.http.get<ArrayBuffer>(path, clean(query), {
      responseType: "arraybuffer",
      headers: { Accept: "*/*" },
    })
    const problem = problemFrom(response)
    if (problem) return this.failed(problem)
    return ok(new Uint8Array(response.data ?? new ArrayBuffer(0)))
  }

  /**
   * A login call: the token arrives in `Set-Cookie`, which the app must read itself. Returns the token with the
   * body so the auth store can keep it.
   */
  async login<T>(
    path: string,
    body: unknown,
  ): Promise<ApiResult<{ body: T; token: string | null }>> {
    const response = await this.http.post<T>(path, body)
    const problem = problemFrom(response)
    if (problem) return this.failed(problem)
    const header = response.headers?.["set-cookie"] as string | string[] | undefined
    const token = cookieOwnedByPlatform() ? BROWSER_SESSION : tokenFromSetCookie(header)
    if (!token) logWarn("login response carried no session cookie")
    return ok({ body: response.data as T, token })
  }

  /** An absolute URL on the API host, for a WebView. */
  url(path: string): string {
    return `${this.http.getBaseURL()}${path}`
  }

  /** The Cookie header value for a WebView on the API host, or null. */
  cookie(): string | null {
    return cookieHeader(this.token)
  }

  /**
   * Sends a request, and gives a sleeping server a second chance.
   *
   * The API is on a plan that stops the container when nobody has used it, and its first request afterwards
   * waits out a hundred-second start-up. Twenty seconds is the right patience for an awake server, so a
   * request that times out is tried once more with the patience a waking one needs: without that, the first
   * sign-in of the morning always failed and trying again just restarted the same twenty seconds.
   *
   * Only timeouts and connection failures are retried, and only once. Anything the server actually answered —
   * a refusal, a conflict, a bad password — is returned as it came.
   */
  private async run<T>(
    send: (config?: { timeout?: number }) => Promise<import("apisauce").ApiResponse<T>>,
  ): Promise<ApiResult<T>> {
    let response = await this.attempt(send)
    if (response instanceof Error) return fail(badData(response.message))

    let problem = problemFrom(response)
    if (problem && (problem.kind === "timeout" || problem.kind === "cannot-connect")) {
      logWarn("api", `${problem.kind} — retrying once while the server wakes`)
      const second = await this.attempt(send, { timeout: Config.API_COLD_START_TIMEOUT_MS })
      if (second instanceof Error) return fail(badData(second.message))
      response = second
      problem = problemFrom(response)
    }
    if (problem) return this.failed(problem)
    return ok(response.data as T)
  }

  private async attempt<T>(
    send: (config?: { timeout?: number }) => Promise<import("apisauce").ApiResponse<T>>,
    config?: { timeout?: number },
  ): Promise<import("apisauce").ApiResponse<T> | Error> {
    try {
      return await send(config)
    } catch (e) {
      return e instanceof Error ? e : new Error("Request failed")
    }
  }

  private failed<T>(problem: ApiProblem): ApiResult<T> {
    if (problem.kind === "unauthorized" && this.onUnauthorized) this.onUnauthorized()
    return fail(problem)
  }
}

/** Drop undefined/null query values so URLs stay clean. */
function clean(query?: Query): Record<string, string | number | boolean> | undefined {
  if (!query) return undefined
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) out[k] = v
  return out
}
