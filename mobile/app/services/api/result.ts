import type { ApiProblem } from "./problem"

/** Every API method returns one of these; callers branch on `ok` and never throw. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; problem: ApiProblem }

export function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data }
}

export function fail<T>(problem: ApiProblem): ApiResult<T> {
  return { ok: false, problem }
}

/** Turn a result into another by transforming its data. */
export function mapResult<T, U>(result: ApiResult<T>, fn: (data: T) => U): ApiResult<U> {
  return result.ok ? ok(fn(result.data)) : result
}
