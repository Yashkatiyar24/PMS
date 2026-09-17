"use client"

/**
 * Who is signed in, which property they are working in, and what they may do.
 *
 * The server decides all three; this only mirrors the answer so screens can hide what the user cannot do.
 * Hiding is a courtesy, not a control: every endpoint checks the role again.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { api } from "./api"

export type Role = "STAFF" | "MANAGER" | "OWNER"

export type CurrentUser = {
  id: string
  name: string
  superAdmin: boolean
  propertyId: string | null
  role: Role | null
  memberships: { propertyId: string; propertyName: string; role: Role }[]
}

const RANK: Record<Role, number> = { STAFF: 0, MANAGER: 1, OWNER: 2 }

type Session = {
  user: CurrentUser | null
  loading: boolean
  reload: () => Promise<void>
  /** True when the signed-in user holds at least this role in the current property. */
  can: (role: Role) => boolean
  switchProperty: (propertyId: string) => Promise<void>
  logout: () => Promise<void>
}

const Context = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ user: CurrentUser | null; loading: boolean }>({ user: null, loading: true })
  const [tick, setTick] = useState(0)
  const { user, loading } = state

  useEffect(() => {
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
  }, [tick])

  /** Ask the server again, e.g. after switching property. */
  const reload = useCallback(async () => {
    setTick((n) => n + 1)
  }, [])

  const can = useCallback(
    (role: Role) => !!user?.role && RANK[user.role] >= RANK[role],
    [user],
  )

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

  const value = useMemo(
    () => ({ user, loading, reload, can, switchProperty, logout }),
    [user, loading, reload, can, switchProperty, logout],
  )
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useSession(): Session {
  const context = useContext(Context)
  if (!context) throw new Error("useSession must be used inside SessionProvider")
  return context
}
