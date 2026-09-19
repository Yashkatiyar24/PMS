"use client"

/**
 * Who is signed in, which property they are working in, and what they may do.
 *
 * The server decides all three; this only mirrors the answer so screens can hide what the user cannot do.
 * Hiding is a courtesy, not a control: every endpoint checks the role again.
 */
import { usePathname } from "next/navigation"
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { api, isPublicScreen } from "./api"

/** Rank. LIMITED is the narrow roles (housekeeping, accountant, maintenance), below the front desk. */
export type Role = "LIMITED" | "STAFF" | "MANAGER" | "OWNER"

export type CurrentUser = {
  id: string
  name: string
  superAdmin: boolean
  propertyId: string | null
  role: Role | null
  memberships: { propertyId: string; propertyName: string; role: Role; position: string }[]
  /** The role as stored (owner, admin, receptionist, housekeeping, ...) and what it may do. */
  position: string | null
  permissions: string[]
}

const RANK: Record<Role, number> = { LIMITED: 0, STAFF: 1, MANAGER: 2, OWNER: 3 }

type Session = {
  user: CurrentUser | null
  loading: boolean
  reload: () => Promise<void>
  /** True when the signed-in user holds at least this role in the current property. */
  can: (role: Role) => boolean
  /** True when the signed-in user's role holds this permission, e.g. "revenue.view". */
  has: (permission: string) => boolean
  switchProperty: (propertyId: string) => Promise<void>
  logout: () => Promise<void>
}

const Context = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ user: CurrentUser | null; loading: boolean }>({ user: null, loading: true })
  const [tick, setTick] = useState(0)
  const { user, loading } = state

  // On a screen a stranger can open there is nobody to resolve, and asking would only produce a 401 that
  // looks like a session ending.
  const anonymous = isPublicScreen(usePathname() ?? "")

  useEffect(() => {
    if (anonymous) return
    let current = true
    api<CurrentUser>("/api/auth/me")
      .then((user) => {
        if (current) setState({ user, loading: false })
      })
      .catch(() => {
        if (current) setState({ user: null, loading: false })
      })
    return () => {
      current = false
    }
  }, [tick, anonymous])

  /** Ask the server again, e.g. after switching property. */
  const reload = useCallback(async () => {
    setTick((n) => n + 1)
  }, [])

  const can = useCallback(
    (role: Role) => !!user?.role && RANK[user.role] >= RANK[role],
    [user],
  )

  const has = useCallback((permission: string) => !!user?.permissions?.includes(permission), [user])

  const switchProperty = useCallback(
    async (propertyId: string) => {
      await api("/api/auth/switch-property", { method: "POST", body: { propertyId } })
      await reload()
    },
    [reload],
  )

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" })
    setState({ user: null, loading: false })
    window.location.href = "/login"
  }, [])

  // Derived rather than stored: on a public screen there is nobody to resolve and nothing to wait for, so
  // it reports "nobody, and done" without an effect ever writing state.
  const value = useMemo(
    () => ({
      user: anonymous ? null : user,
      loading: anonymous ? false : loading,
      reload, can, has, switchProperty, logout,
    }),
    [anonymous, user, loading, reload, can, has, switchProperty, logout],
  )
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useSession(): Session {
  const context = useContext(Context)
  if (!context) throw new Error("useSession must be used inside SessionProvider")
  return context
}
