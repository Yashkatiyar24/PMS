# Padav mobile — screen map

Maps every web route in `frontend/src/app` to a React Native screen or flow. Companion to
[`FEATURE_INVENTORY.md`](FEATURE_INVENTORY.md), which holds the API contract, roles and data models this map refers to.

Decisions already taken (see FEATURE_INVENTORY §0): existing login flow only (no Google), Firebase used for FCM only,
public stranger pages (`/g/[token]`, `/book/[slug]`) stay on the web, app lives in `mobile/`.

## 1. Navigation architecture

React Navigation as shipped by Ignite: one native stack at the root, a bottom-tab navigator for the signed-in app,
and one native stack per tab. Secondary forms open as **bottom sheets** (the web `Sheet`), overflow actions as an
**action sheet** (the web `Menu`). All route names live in `app/navigators/`.

```
RootStack
├── Auth                         (no session)
│   └── LoginScreen
├── ForcePasswordChange          (session, mustChangePassword = true; cannot go back)
├── BillingClosed                (session, billingStatus = "closed")
├── Platform                     (superAdmin with no propertyId → this replaces MainTabs)
│   ├── PlatformListScreen
│   └── PlatformPropertyScreen
└── MainTabs                     (session in a property)
    ├── TodayTab      → TodayStack:    Today, CheckIn, Stay, NeedsAttention
    ├── GuestsTab     → GuestsStack:   Guests, Guest, Stay
    ├── BookingsTab   → BookingsStack: TapeChart, NewBooking, Stay
    ├── RoomsTab      → RoomsStack:    Rooms, Maintenance, LostFound
    ├── ReportsTab    → ReportsStack:  Reports, PeriodReport
    └── SettingsTab   → SettingsStack: Settings, SettingsGroup, PropertyDetails, RoomTypes,
                                       TaxRules, Staff, Channels, Restaurant, Inventory,
                                       Expenses, Maintenance, LostFound, Audit, Notifications,
                                       Portfolio, Sessions, PlatformList, PlatformProperty
```

Tab visibility mirrors `BottomNav.tsx` exactly:

| Tab | Shown when |
|---|---|
| Today | `has("reservations.view")` |
| Guests | `has("reservations.view")` |
| Bookings | `has("reservations.view")` |
| Rooms | desk **or** `has("housekeeping")` **or** `has("maintenance")` |
| Reports | `has("revenue.view")` |
| Settings | always |
| Platform (extra tab) | `user.superAdmin` and in a property |

Initial route: desk roles → Today; housekeeping/maintenance/accountant → Rooms (accountant lands on Reports if no
Rooms tab); platform admin with no property → Platform.

Header (every tab root): property name (tap → property switcher sheet when >1 membership), search icon (global
booking search sheet), bell with unread badge → Notifications, avatar → user menu sheet (Notifications, All
properties, Switch to…, Language, Text size, Appearance, Change password, Sessions, Log out).

Deep links: `padav://stays/{id}`, `padav://rooms`, `padav://notifications`, `padav://maintenance`, etc. — the FCM
`data.link` (web path) is mapped 1:1 onto these routes in `app/navigators/linking.ts`.

## 2. Route → screen map

Legend — **Module** = `app/features/<module>`; **Gate** = `usePermission()` check (same strings as the web);
**Mobile adaptation** = where the phone differs from the browser.

### Auth & shell

| Web | Mobile | Module | Gate | Mobile adaptation |
|---|---|---|---|---|
| `/login` landing + sign-in sheet | `LoginScreen` | auth | public | Marketing landing dropped; form only (property code, email, password) + "Sign in with a code" toggle (OTP send/verify). Code remembered in MMKV. `deviceName` = device model. Session token read from `Set-Cookie`, stored encrypted. |
| forced `ChangePassword` sheet | `ForcePasswordChangeScreen` | auth | session | Full screen, no back. |
| billing `closed` gate | `BillingClosedScreen` | auth | session | Lock icon, switch-property buttons, logout. `overdue`/`readonly` → persistent banner component in `MainTabs`. |
| user menu → Change password | `ChangePasswordSheet` | auth | session | Bottom sheet. |
| (web has none) | `SessionsScreen` | auth | session | List `GET /api/auth/sessions`, revoke. Parity-plus, cheap; lets a user kill a lost phone. |
| property switcher (menu) | `PropertySwitcherSheet` | auth | >1 membership | Bottom sheet; switching clears caches and resets tabs. |
| `/portfolio` | `PortfolioScreen` | portfolio | >1 membership | Cards per property; "Open" switches property. |

### Today / front desk

| Web | Mobile | Module | Gate | Mobile adaptation |
|---|---|---|---|---|
| `/` Today | `TodayScreen` | today | `reservations.view` | Occupancy ring, 7 activity tiles as horizontally scrolling chips, StayList (FlashList). Forecast card (if `revenue.view`) with 14 bars drawn as `View`s. Pull-to-refresh + 30 s foreground refresh. "Check-in" and "New booking" as header/FAB actions. |
| `/check-in` | `CheckInScreen` | bookings | `checkin` | 3 steps as vertically stacked cards with sticky bottom "To collect" bar. Camera via `expo-image-picker` → `utils/image.compress`. OCR **deferred** (parity gap). Self-registration QR shown from server `qrDataUri`; 2 s polling. Offline: write queued, toast, back to Today. |
| `/stays/[id]` | `StayScreen` | bookings | `reservations.view` | Header facts, segmented control (Accommodation, Bill, Guest, Receipts, Activity), state-driven primary actions in sticky footer, overflow action sheet. Every sub-form (Pay, Add extra, Discount, Refund, Credit note, Cancel, No-show, Edit details, Party, Add/Change room, Give back, Checkout override) is its own `*Sheet` component ≤250 lines. Receipts open in `ReceiptViewer` (WebView with session cookie) with share. |
| `/needs-attention` | `NeedsAttentionScreen` | offline | session | Failed queued writes; "Done" clears. Reached from OfflineBar link. |
| global `SearchBox` | `BookingSearchSheet` | bookings | `reservations.view` | Debounced 250 ms; row tap → Stay. |

### Bookings

| Web | Mobile | Module | Gate | Mobile adaptation |
|---|---|---|---|---|
| `/bookings` tape chart | `TapeChartScreen` | bookings | `reservations.view` | Two-axis scroll (sticky unit column + horizontal days). Bars are pressable → Stay. **Drag-to-move replaced by** long-press → "Move stay" sheet (pick new unit / arrival date) → `POST /{id}/move`. Tap empty cell today → CheckIn (prefilled), future → NewBooking (prefilled). Date jump via native date picker. Collapsible type groups. |
| `/bookings/new` | `NewBookingScreen` | bookings | `reservations.create` | Same cards (Guest, Room & nights, Particular unit, More details, Advance) with summary + Confirm in sticky footer. Availability refetched on date change. Group source multi-select of units. |

### Guests

| Web | Mobile | Module | Gate | Mobile adaptation |
|---|---|---|---|---|
| `/guests` | `GuestsScreen` | guests | `reservations.view` | Segmented In house / All guests; search field; FlashList of stay cards or register cards. |
| `/guests/[id]` | `GuestScreen` | guests | `reservations.view` | Stat tiles, staying-now row, details, stays, payments. Photo / ID photo open via signed URL in image viewer; "Take photo" via camera. Edit → `GuestEditSheet`. |

### Rooms & housekeeping

| Web | Mobile | Module | Gate | Mobile adaptation |
|---|---|---|---|---|
| `/rooms` | `RoomsScreen` | rooms | desk / `housekeeping` / `maintenance` | Segmented filter (All, Mine, Clean, Needs cleaning, Out of order); grid of tiles grouped by building/floor (2–3 columns). Tap → `RoomSheet` with status actions (optimistic), Block/Maintenance reason, Report a problem, Housekeeping assignment disclosure. |
| `ReportIssue` sheet | `ReportIssueSheet` | maintenance | `maintenance.report` | Shared by Rooms and Maintenance. |

### Reports

| Web | Mobile | Module | Gate | Mobile adaptation |
|---|---|---|---|---|
| `/reports` | `ReportsScreen` | reports | `revenue.view` | Collection headline, stat tiles, Cash in hand (handover button, manager+), Unpaid bills list. Menu: Period report, Send now, Guest register CSV, Month CSV — CSVs downloaded via authenticated fetch and handed to `expo-sharing`. |
| `/reports/period` | `PeriodReportScreen` | reports | `revenue.view` | Range segmented + custom dates (native pickers). Sections as collapsible cards; bar comparisons drawn with `View`s (no chart library). Online payments with "Check". CSV via share. |

### Notifications

| Web | Mobile | Module | Gate | Mobile adaptation |
|---|---|---|---|---|
| `/notifications` | `NotificationsScreen` | notifications | session | Feed with kind icons; marks seen on open. Plus FCM: permission request on first sign-in, token → `POST /api/notifications/push-token {platform: "android"\|"ios"}`, re-sync on token refresh and on property switch; foreground toast, background/killed → tap deep-links to `data.link`. |

### Settings

| Web | Mobile | Module | Gate | Mobile adaptation |
|---|---|---|---|---|
| `/settings` (hub) | `SettingsScreen` | settings | session | Sectioned list: Operations (permission-gated), Property setup (manager+), Rules (one row per registry group with changed-count badge), account rows, Log out. Search over settings. |
| `/settings` (group editor) | `SettingsGroupScreen` | settings | per-setting `who` | Registry-driven controls (BOOL switch, INT with ₹/unit handling, TIME picker, ENUM chips, LIST ordered multi-chips, TEXT, I18N_TEXT hi/en). Draft map + sticky "Save changes" bar; `PATCH /api/settings`. Unsaved-changes guard on back. |
| `/settings/property` | `PropertyDetailsScreen` | settings | MANAGER | Form + GSTIN disclosure; photo card (camera/gallery → compress 600 KB → upload; remove). |
| `/settings/rooms` | `RoomTypesScreen` | rooms | MANAGER | Room type list + rooms chips; `RoomTypeSheet`, `AddRoomsSheet` (range), `RoomEditSheet` (with bed toggles / add bed). |
| `/settings/tax` | `TaxRulesScreen` | settings | MANAGER view / OWNER add | In-force card, rule list; `TaxRuleSheet` with slab rows. |
| `/settings/staff` | `StaffScreen` | staff | MANAGER view / `staff.manage` edit | Property-code card, member rows with action sheet (Role, Reset password, Set PIN, Remove). `InviteSheet`; `CredentialsSheet` with copy. |
| `/settings/channels` | `ChannelsScreen` | channels | MANAGER | Booking-page card (create/copy/open), conflicts list, OTA links with action sheet (Sync, Change address, Rotate, Unlink); `ChannelLinkSheet`. |

### Operations modules (each hidden unless the property has the module and the role the permission)

| Web | Mobile | Module | Gate | Mobile adaptation |
|---|---|---|---|---|
| `/restaurant` | `RestaurantScreen` | restaurant | `restaurant` | Segmented Orders / Menu; `OrderSheet` (for: counter or in-house guest; menu buttons; custom line; qty steppers), `SettleSheet` (charge to room / pay / cancel), `MenuItemSheet` (manager+). Bill HTML opens in `ReceiptViewer`. |
| `/inventory` | `InventoryScreen` | stock | `inventory` | Segmented All / Low; sections by category; `StockItemSheet`, `MovementSheet` with history. |
| `/expenses` | `ExpensesScreen` | expenses | `expenses` | Month pager, totals, category KV, list; `ExpenseSheet` (bill photo/PDF via picker → compress 400 KB → upload); `VoidSheet`; receipt opens via signed URL. |
| `/maintenance` | `MaintenanceScreen` | maintenance | `maintenance` / `maintenance.report` | Segmented Open / All; `TicketSheet` (status, assignee, priority, resolution — read-only for reporters); report flow: `PickRoomSheet` → `ReportIssueSheet`. |
| `/lost-found` | `LostFoundScreen` | lostfound | `lost_found` | List; `LostItemSheet` (add), `LostItemStatusSheet`. |
| `/audit` | `AuditScreen` | audit | `audit.view` | Filters card (from/to pickers, table, search), collapsible entries with before/after JSON. |

### Platform admin

| Web | Mobile | Module | Gate | Mobile adaptation |
|---|---|---|---|---|
| `/admin` | `PlatformListScreen` | admin | `superAdmin` | Tiles, filter segmented (all/trial/active/attention/quiet), sort, search, property cards; `OnboardPropertySheet` → `CredentialsSheet`. Export CSV via share. |
| `/admin/[id]` | `PlatformPropertyScreen` | admin | `superAdmin` | Tiles, photo card, details, team (reset password), plan chips, billing chips, active switch, modules multi-chips, notes, recent changes. |

### Public pages — intentionally not in the app

| Web | Decision |
|---|---|
| `/g/[token]` guest self-registration | Stays web-only. The desk shows the QR (server-rendered) in `CheckInScreen`; guests open it in their own browser. |
| `/book/[slug]` public booking page | Stays web-only. `ChannelsScreen` shows/copies/opens the public URL. |

## 3. Shared UI kit (`app/components`)

Equivalents of `ui.tsx`, built on Ignite's `Text`/`Button`/`Screen` and the Ignite theme tokens (colours copied from
`globals.css` light/dark): `Button`, `IconButton`, `PageHeader`, `Card`, `SectionLabel`, `StatTile`, `ListRow`,
`ListCard`, `Avatar`, `Disclosure`, `Segmented`, `Sheet` (bottom sheet), `ActionSheet` (menu), `Field`,
`TextField`, `ChoiceChips`, `Stepper`, `Chip`, `Banner`, `Loading`, `EmptyState`, `KV`, `DatePickerField`,
`TimePickerField`, `MoneyField`, `PinField`, `OfflineBar`, `StaleLabel`, `ReceiptViewer`, `QrCode`.

## 4. Cross-cutting flows

| Concern | Mobile implementation |
|---|---|
| Session | `utils/auth.ts`: token in encrypted MMKV, sent as `Cookie` header; `GET /api/auth/me` on launch and foreground; 401 → clear + `Auth` stack. |
| CSRF | `X-Requested-With: pms` on every non-GET (ApiService). |
| Approval PIN | `PinField` appears in a sheet only when `usePermission()` lacks the matching permission; body carries `{approverId: user.id, pin}`. |
| Offline writes | `utils/offlineQueue.ts` in MMKV, scoped by user+property; only check-in and folio payments queue (as on the web); replay oldest-first on reconnect / 30 s; 4xx → Needs attention; 5xx/network → stop. |
| Offline reads | Every list store persists its last payload in MMKV with `fetchedAt`; screens render it with a `StaleLabel` ("Updated 5 min ago") while refetching; cleared on logout / property switch. |
| Push | `utils/notifications.ts` wraps `@react-native-firebase/messaging`; token sync, handlers for foreground/background/killed, deep-link on tap. |
| i18n | Ignite i18next with the web's `en.json`/`hi.json` copied verbatim; default `hi`; language/text-size/theme preferences in MMKV. |
| Errors | Every ApiService method returns `Result<T>`; `showError()` toast helper; one `ErrorBoundary` at the root. |
