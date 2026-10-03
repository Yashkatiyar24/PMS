import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react"

import type { RootStoreType } from "./RootStore"
import { setupRootStore } from "./setupRootStore"

const RootStoreContext = createContext<RootStoreType | null>(null)

/** Creates the root store once, boots the session, and provides it to the tree. */
export function StoreProvider({ children }: PropsWithChildren) {
  const [store] = useState(() => setupRootStore())
  useEffect(() => {
    void store.auth.boot()
  }, [store])
  return <RootStoreContext.Provider value={store}>{children}</RootStoreContext.Provider>
}

export function useStores(): RootStoreType {
  const store = useContext(RootStoreContext)
  if (!store) throw new Error("useStores must be used inside StoreProvider")
  return store
}
