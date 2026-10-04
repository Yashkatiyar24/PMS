import { useCallback, useRef } from "react"
import { Animated, Platform } from "react-native"

import { useReducedMotion } from "./useReducedMotion"

/** The browser has no native animated module; it runs the same spring on the JS thread without a warning. */
const NATIVE = Platform.OS !== "web"

/**
 * The squash of a press: the control shrinks a touch under the finger and springs back when it lifts, so a tap
 * is felt before the screen answers it. Runs on the native thread. A phone set to reduce motion gets no scale.
 *
 *   const press = usePressScale()
 *   <Animated.View style={press.style}><Pressable onPressIn={press.onPressIn} onPressOut={press.onPressOut} /></Animated.View>
 */
export function usePressScale(to = 0.97) {
  const scale = useRef(new Animated.Value(1)).current
  const reduced = useReducedMotion()
  const onPressIn = useCallback(() => {
    if (reduced) return
    Animated.spring(scale, {
      toValue: to,
      speed: 40,
      bounciness: 0,
      useNativeDriver: NATIVE,
    }).start()
  }, [reduced, scale, to])
  const onPressOut = useCallback(() => {
    if (reduced) return
    Animated.spring(scale, {
      toValue: 1,
      speed: 20,
      bounciness: 6,
      useNativeDriver: NATIVE,
    }).start()
  }, [reduced, scale])
  return { style: { transform: [{ scale }] }, onPressIn, onPressOut }
}
