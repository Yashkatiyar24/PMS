/**
 * Who is signed in, which property they work in and what they may do. The server decides all three; this store
 * mirrors `/api/auth/me` and keeps the session token alive across launches.
 */
import { flow, getEnv, Instance, types } from "mobx-state-tree"

import type { CurrentUser, Role } from "@/features/auth/types"
import type { ApiService } from "@/services/api"
import { clearToken, loadToken, normaliseCode, rememberCode, saveToken } from "@/utils/auth"
import { hasPermission, hasRank, type Permission } from "@/utils/permissions"
import { removeByPrefix } from "@/utils/storage"

import { ProblemModel, toProblem } from "./problemModel"

export type AuthStatus = "booting" | "signedOut" | "signedIn"

export const CACHE_PREFIX = "cache."

/** How long the warm-up call may take before the login screen says the server is waking. */
export const SLOW_AFTER_MS = 4000

export const AuthStore = types
  .model("AuthStore", {
    status: types.optional(
      types.enumeration<AuthStatus>(["booting", "signedOut", "signedIn"]),
      "booting",
    ),
    user: types.maybeNull(types.frozen<CurrentUser>()),
    busy: false,
    lastProblem: types.maybeNull(ProblemModel),
    /** True while the server has taken suspiciously long to answer the login screen's warm-up call. */
    serverWaking: false,
  })
  .views((self) => ({
    get isSignedIn() {
      return self.status === "signedIn" && !!self.user
    },
    get propertyName(): string {
      const u = self.user
      return u?.memberships.find((m) => m.propertyId === u.propertyId)?.propertyName ?? ""
    },
    get otherMemberships() {
      const u = self.user
      return u ? u.memberships.filter((m) => m.propertyId !== u.propertyId) : []
    },
    /** True when the signed-in user holds at least this rank in the working property. */
    can(role: Role): boolean {
      return hasRank(self.user?.role, role)
    },
    /** True when the signed-in user's role holds this permission. */
    has(permission: Permission): boolean {
      return hasPermission(self.user?.permissions, permission)
    },
  }))
  .actions((self) => {
    const api = (): ApiService => getEnv(self).api

    function forgetCachedData() {
      removeByPrefix(CACHE_PREFIX)
    }

    function signOutLocally() {
      clearToken()
      api().client.setToken(null)
      forgetCachedData()
      self.user = null
      self.status = "signedOut"
    }

    const refreshMe = flow(function* refreshMe() {
      const result = yield api().auth.me()
      if (result.ok) {
        self.user = result.data as CurrentUser
        self.status = "signedIn"
        return true
      }
      // Only a definite 401 ends the session; offline keeps the last known user.
      if (result.problem.kind === "unauthorized") signOutLocally()
      else if (!self.user) self.status = "signedOut"
      return false
    })

    /** On launch: pick up the saved token and ask the server who we are. */
    const boot = flow(function* boot() {
      const token = loadToken()
      if (!token) {
        self.status = "signedOut"
        return
      }
      api().client.setToken(token)
      yield refreshMe()
    })

    const finishLogin = flow(function* finishLogin(token: string | null) {
      if (!token) {
        self.lastProblem = toProblem({
          kind: "bad-data",
          status: null,
          message: "No session returned",
          temporary: false,
        })
        return false
      }
      saveToken(token)
      api().client.setToken(token)
      forgetCachedData()
      return yield refreshMe()
    })

    /**
     * Wakes a sleeping server as the login screen opens.
     *
     * The API's host stops the container after a quiet spell and the first request afterwards waits out a
     * start-up of a minute or two. Fired on the way in, that wait overlaps the typing of a code, an email and a
     * password instead of following the tap on Sign in; and once it has gone on for a few seconds the screen
     * can say so, which is the difference between waiting and giving up. Nothing here fails: an unreachable
     * server is reported by the real login, with the real message.
     */
    const warmUp = flow(function* warmUp(slowAfterMs: number = SLOW_AFTER_MS) {
      let handle: ReturnType<typeof setTimeout> | undefined
      const slow = new Promise<"slow">((resolve) => {
        handle = setTimeout(() => resolve("slow"), slowAfterMs)
      })
      const health = api().auth.health()
      const first: "slow" | "answered" = yield Promise.race([health.then(() => "answered"), slow])
      if (first === "slow") {
        self.serverWaking = true
        yield health
      }
      clearTimeout(handle)
      self.serverWaking = false
    })

    const loginWithPassword = flow(function* loginWithPassword(
      code: string,
      email: string,
      password: string,
      deviceName: string,
    ) {
      self.busy = true
      self.lastProblem = null
      const normalised = normaliseCode(code)
      const result = yield api().auth.login({
        code: normalised || null,
        email: email.trim(),
        password,
        deviceName,
      })
      self.busy = false
      if (!result.ok) {
        self.lastProblem = toProblem(result.problem)
        return false
      }
      if (normalised) rememberCode(normalised)
      return yield finishLogin(result.data.token)
    })

    const sendOtp = flow(function* sendOtp(target: string) {
      self.busy = true
      self.lastProblem = null
      const result = yield api().auth.sendOtp(target.trim())
      self.busy = false
      if (!result.ok) self.lastProblem = toProblem(result.problem)
      return result.ok as boolean
    })

    const verifyOtp = flow(function* verifyOtp(target: string, code: string, deviceName: string) {
      self.busy = true
      self.lastProblem = null
      const result = yield api().auth.verifyOtp({
        target: target.trim(),
        code: code.trim(),
        deviceName,
      })
      self.busy = false
      if (!result.ok) {
        self.lastProblem = toProblem(result.problem)
        return false
      }
      return yield finishLogin(result.data.token)
    })

    const switchProperty = flow(function* switchProperty(propertyId: string) {
      self.busy = true
      const result = yield api().auth.switchProperty(propertyId)
      self.busy = false
      if (!result.ok) {
        self.lastProblem = toProblem(result.problem)
        return false
      }
      forgetCachedData()
      return yield refreshMe()
    })

    const logout = flow(function* logout() {
      yield api().auth.logout()
      signOutLocally()
    })

    const changePassword = flow(function* changePassword(
      currentPassword: string | null,
      password: string,
    ) {
      self.busy = true
      self.lastProblem = null
      const result = yield api().auth.changeMyPassword({ currentPassword, password })
      self.busy = false
      if (!result.ok) {
        self.lastProblem = toProblem(result.problem)
        return false
      }
      yield refreshMe()
      return true
    })

    function clearProblem() {
      self.lastProblem = null
    }

    /** The API client saw a 401: the session is over. */
    function sessionEnded() {
      if (self.status !== "signedOut") signOutLocally()
    }

    return {
      boot,
      refreshMe,
      warmUp,
      loginWithPassword,
      sendOtp,
      verifyOtp,
      switchProperty,
      logout,
      changePassword,
      clearProblem,
      sessionEnded,
    }
  })

export interface AuthStoreType extends Instance<typeof AuthStore> {}
