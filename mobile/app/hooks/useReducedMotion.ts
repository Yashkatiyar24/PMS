import { useEffect, useState } from "react"
import { AccessibilityInfo } from "react-native"

/**
 * Whether the phone asks for less motion (iOS "Reduce Motion", Android "Remove animations"). Every animation in
 * the app reads this and stands still when it is on: a press still changes colour, a list still loads, nothing
 * moves to say so.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    let live = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => live && setReduced(on))
      .catch(() => undefined)
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced)
    return () => {
      live = false
      sub.remove()
    }
  }, [])
  return reduced
}
