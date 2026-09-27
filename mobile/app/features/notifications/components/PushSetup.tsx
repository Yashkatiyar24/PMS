import { usePushSetup } from "../hooks/usePushSetup"

/** Mounts the push wiring once, inside the store and navigation providers. */
export function PushSetup() {
  usePushSetup()
  return null
}
