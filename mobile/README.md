# Padav mobile

The React Native twin of the Padav desk app (`../frontend`): the same features, roles and API, on Android and
iOS. Built on Infinite Red's Ignite boilerplate (Expo prebuild workflow, TypeScript strict), MobX-State-Tree,
React Navigation, apisauce, MMKV, react-hook-form + zod, FlashList and Firebase Cloud Messaging.

- What the app covers and how it maps to the web: [`FEATURE_INVENTORY.md`](FEATURE_INVENTORY.md),
  [`SCREEN_MAP.md`](SCREEN_MAP.md), [`FEATURE_PARITY_CHECKLIST.md`](FEATURE_PARITY_CHECKLIST.md).
- Backend: the Spring Boot API in `../backend` (same endpoints the web uses; nothing mobile-specific except that
  push messages now carry `kind`, `link` and `notificationId` in their data map).

## Prerequisites

- Node 20+ (22 recommended), npm 10.
- Android: Android Studio with an SDK 34+ platform, an emulator or a device with USB debugging; `ANDROID_HOME` set.
- iOS (macOS only): Xcode 15+, CocoaPods (`sudo gem install cocoapods`), a simulator or a device with a dev profile.
- The Padav API running: from the repo root, `docker compose -f infra/docker-compose.yml up -d`, then
  `cd backend && mvn spring-boot:run -Dspring-boot.run.profiles=dev`. The dev profile seeds a property
  (code `SRD1001`, `owner@pms.local` / `password123`, approval PIN `1234`).
- A Firebase project for push (optional to build, required for notifications): add an Android app with package
  `in.padav.app` and an iOS app with bundle id `in.padav.app`, then download `google-services.json` and
  `GoogleService-Info.plist` into this folder. They are gitignored; `google-services.json.example` shows the shape.
  Point the API at the same project with `PMS_PUSH_PROVIDER=fcm` and its service-account JSON.

## Setup

```bash
cd mobile
npm install
cp .env.example .env          # set EXPO_PUBLIC_API_URL
```

`EXPO_PUBLIC_API_URL` is the API origin. On the Android emulator use `http://10.0.2.2:8080`; on a physical device
use your machine's LAN IP (`http://192.168.x.y:8080`); the iOS simulator can use `http://localhost:8080`.
Nothing else is configured in code: keys and hosts come from `.env` and the Firebase files only.

## Run on Android

```bash
npx expo prebuild --platform android   # first time, and after changing app.json plugins
npm run android                        # builds the dev client and starts Metro
```

Without `google-services.json` the build fails at the Firebase plugin; either add the file or temporarily remove
the two `@react-native-firebase/*` entries from `app.json` `plugins` to build without push.

## Run on iOS

```bash
npx expo prebuild --platform ios
cd ios && pod install && cd ..
npm run ios
```

Push on iOS additionally needs the APNs key uploaded to Firebase and the `aps-environment` entitlement that
`app.json` already declares; a simulator cannot receive pushes.

## Checks

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint, zero warnings allowed
npm test              # jest: utils, stores, offline queue, navigation linking
npm run check         # all three
npm run test:maestro  # Maestro smoke flows (needs a running dev build + seeded API)
```

A Husky pre-commit hook runs lint-staged (eslint + prettier) on staged files; it is installed by `npm install`
via the `prepare` script (`git config core.hooksPath` points at `mobile/.husky`).

## How the code is laid out

```
app/
  app.tsx                 providers: theme → store → navigation, toast host, push + offline sync
  components/             the UI kit (Button, Sheet, ActionSheet, Input, Chip, Banner, StatTile, …)
  config/                 env-driven config (API_URL from EXPO_PUBLIC_API_URL)
  features/<module>/      screens, components, store, hooks, lib, types — one folder per domain
  hooks/useResource.ts    load + cache (MMKV) + refresh-while-foregrounded for any API list
  i18n/                   the web app's en/hi strings, verbatim, plus mobile-only keys
  models/                 the MST root store and StoreProvider
  navigators/             root stack, tabs, shared screens, deep links, permission gates
  services/api/           the single ApiService: one typed group per backend module, one HTTP client
  theme/                  colours (from the web's globals.css), spacing, typography, tones
  utils/                  date, format, storage, logger, validation, permissions, auth, image, network, files, notifications
```

Rules that keep it simple (enforced by ESLint where possible): screens never import date-fns, zod, MMKV, Firebase,
expo-image-picker or apisauce directly — only `app/utils` and `app/services/api` do; every API call returns
`ApiResult<T>` (`{ok, data} | {ok, problem}`), errors surface through `showError` and one `ErrorBoundary`; no
`any`; files stay around 250 lines (the three Ignite kit files that exceed it are kept as shipped).

## Offline

Check-ins and folio payments are queued in MMKV when the network is down (each carries a `clientUuid` the server
treats as an idempotency key) and replayed oldest-first when the network returns or every 30 s. A write the
server refuses lands in **Needs attention**. Every list keeps its last payload with an "Updated N min ago" label.
