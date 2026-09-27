export interface ConfigBaseProps {
  persistNavigation: "always" | "dev" | "prod" | "never"
  catchErrors: "always" | "dev" | "prod" | "never"
  exitRoutes: string[]
  /** The API origin, e.g. `https://api.example.in`. Read from `EXPO_PUBLIC_API_URL`; never hardcoded. */
  API_URL: string
  /** Milliseconds before a request times out. */
  API_TIMEOUT_MS: number
}

export type PersistNavigationConfig = ConfigBaseProps["persistNavigation"]

const BaseConfig: ConfigBaseProps = {
  persistNavigation: "dev",
  catchErrors: "always",
  /** Android back on these routes leaves the app. */
  exitRoutes: ["Today", "Rooms", "Login", "PlatformList"],
  API_URL: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080",
  API_TIMEOUT_MS: 20000,
}

export default BaseConfig
