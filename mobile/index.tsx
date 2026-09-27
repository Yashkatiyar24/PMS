import "@expo/metro-runtime" // fast refresh on web without expo-router
import { registerRootComponent } from "expo"

import { App } from "@/app"
import { logDebug } from "@/utils/logger"
import { setBackgroundPushHandler } from "@/utils/notifications"

// Runs headless for pushes that arrive with the app killed or in the background. The OS shows the
// notification itself; on tap `usePushSetup` deep-links from `data.link`, so nothing else is needed here.
setBackgroundPushHandler(async (message) => {
  logDebug("background push", message.data)
})

registerRootComponent(App)
