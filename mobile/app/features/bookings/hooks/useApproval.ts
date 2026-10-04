import { useState } from "react"

import { usePermission } from "@/features/auth/hooks/usePermission"
import type { Permission } from "@/utils/permissions"

import type { Approval } from "../types"

/**
 * The approval-PIN pattern: when the signed-in role lacks the permission an action needs, a manager's PIN is
 * sent as `{approverId, pin}`; when it holds the permission the body carries nulls and no PIN is asked for.
 */
export function useApproval(permission: Permission) {
  const { has, user } = usePermission()
  const [pin, setPin] = useState("")
  const needsPin = !has(permission)
  const approval: Approval = needsPin
    ? { approverId: user?.id ?? null, pin: pin || null }
    : { approverId: null, pin: null }
  const ready = !needsPin || pin.length >= 4
  return { needsPin, pin, setPin, approval, ready, reset: () => setPin("") }
}
