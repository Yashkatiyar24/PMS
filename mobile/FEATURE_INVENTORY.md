# Padav — feature inventory for the mobile app

Everything the web app (`frontend/`) does and every backend capability (`backend/`) it relies on, catalogued so the
React Native app in `mobile/` can reach feature parity. Sources: every file under `frontend/src`, every controller,
service, record and migration under `backend/src/main`. Companion: [`SCREEN_MAP.md`](SCREEN_MAP.md).

Part A (§0–§6) is the product view: modules, roles, flows, behaviours. Part B (§7–§10) is the verified API contract,
data model, settings registry and background jobs.

---

## 0. Decisions already taken for the mobile app

| Topic                      | Decision                                                                                                                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in                    | **Existing flow only**: property code + email + password (`POST /api/auth/login`), and phone/email OTP (`/otp/send`, `/otp/verify`). No Google sign-in; `@react-native-google-signin` and `@react-native-firebase/auth` are **not** used.                                                         |
| Session                    | Backend issues an HttpOnly cookie `pms_session`. The app reads the token from the login response's `Set-Cookie`, stores it in an encrypted MMKV instance and sends `Cookie: pms_session=…` itself. No refresh endpoint exists: `/api/auth/me` on launch/foreground; any 401 → wipe token → login. |
| Firebase                   | `@react-native-firebase/app` + `messaging` only, for FCM. Token → `POST /api/notifications/push-token {platform: "android"\|"ios"}`.                                                                                                                                                              |
| Backend change             | One small addition: put `kind` and `link` into the FCM `data` map (today it is empty) so a tap can deep-link. Separate commit in `backend/`.                                                                                                                                                      |
| Public pages               | `/g/[token]` (guest self-registration) and `/book/[slug]` (public booking page) stay web-only; the app shows/copies the URLs and QR.                                                                                                                                                              |
| Platform admin             | Included, built last.                                                                                                                                                                                                                                                                             |
| Extra libraries (approved) | `expo-image-picker` (camera/gallery), `react-native-svg` + `react-native-qrcode-svg` (QR), `react-native-webview` + `expo-sharing` (receipts, bills, CSVs), i18next as shipped by Ignite.                                                                                                         |
| Different on a phone       | On-device ID OCR uses ML Kit (Android) / Apple Vision (iOS) via `expo-text-extractor` instead of tesseract.js; charts drawn with plain `View`s.                                                                                                                                                   |
| Location / env             | App at `mobile/`; `API_BASE_URL` via Expo env; Firebase config files are gitignored placeholders.                                                                                                                                                                                                 |
| Module order               | Today → Bookings (tape chart, new, check-in, stay/folio) → Guests → Rooms & housekeeping → Reports → Notifications → Settings (property, rooms, staff, tax, channels) → Operations (maintenance, lost & found, restaurant, stock, expenses, audit) → Portfolio → Platform admin.                  |

---

## 1. Product overview

Padav is a multi-tenant PMS for small and mid-sized Indian properties (hotels, guest houses, dharamshalas). One
Postgres database, one property per session ("working property"), row-level security per property. Hindi-first UI,
integer-paise money, offline-tolerant desk, WhatsApp/SMS/email/push through an outbox.

Feature modules (web route → module):

| #   | Module                          | Web routes                                                                                                                             | Optional module flag |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1   | Auth & shell                    | `/login`, user menu, property switcher, billing gate, forced password change                                                           | —                    |
| 2   | Today (front-desk dashboard)    | `/`                                                                                                                                    | —                    |
| 3   | Bookings                        | `/bookings` (tape chart), `/bookings/new`, `/check-in`, `/stays/[id]`, global search                                                   | —                    |
| 4   | Folio, payments, receipts       | inside `/stays/[id]`                                                                                                                   | —                    |
| 5   | Guests                          | `/guests`, `/guests/[id]`, self-registration QR                                                                                        | —                    |
| 6   | Rooms & housekeeping            | `/rooms`                                                                                                                               | —                    |
| 7   | Reports                         | `/reports`, `/reports/period`, CSV exports                                                                                             | —                    |
| 8   | Notifications                   | `/notifications`, unread badge, push                                                                                                   | —                    |
| 9   | Settings                        | `/settings` (registry-driven rules), `/settings/property`, `/settings/rooms`, `/settings/tax`, `/settings/staff`, `/settings/channels` | —                    |
| 10  | Restaurant / POS                | `/restaurant`                                                                                                                          | `restaurant`         |
| 11  | Stock inventory                 | `/inventory`                                                                                                                           | `inventory`          |
| 12  | Expenses                        | `/expenses`                                                                                                                            | `expenses`           |
| 13  | Maintenance                     | `/maintenance`, Report-a-problem sheet                                                                                                 | `maintenance`        |
| 14  | Lost & found                    | `/lost-found`                                                                                                                          | `lost_found`         |
| 15  | Audit log                       | `/audit`                                                                                                                               | `audit`              |
| 16  | Portfolio (multi-property)      | `/portfolio`                                                                                                                           | —                    |
| 17  | Offline queue / needs attention | `/needs-attention`, OfflineBar                                                                                                         | —                    |
| 18  | Platform admin (super admin)    | `/admin`, `/admin/[id]`                                                                                                                | —                    |
| —   | Public (web only)               | `/g/[token]`, `/book/[slug]`                                                                                                           | —                    |

---

## 2. Roles, ranks and permissions

Stored roles (`property_users.role`): `owner, admin, manager, receptionist, staff, housekeeping, accountant, maintenance`.
Rank: owner→`OWNER`; admin, manager→`MANAGER`; receptionist, staff→`STAFF`; others→`LIMITED`. `superAdmin` is a user
flag independent of property roles.

| Role                | Permissions                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| owner, admin        | all 21                                                                                                                                   |
| manager             | all except `staff.manage`                                                                                                                |
| receptionist, staff | `reservations.view, reservations.create, reservations.edit, checkin, checkout, housekeeping, maintenance.report, restaurant, lost_found` |
| housekeeping        | `housekeeping, maintenance.report, inventory, lost_found`                                                                                |
| maintenance         | `maintenance, maintenance.report`                                                                                                        |
| accountant          | `reservations.view, revenue.view, refund, invoice.edit, expenses, inventory, audit.view`                                                 |

All permissions: `reservations.view, reservations.create, reservations.edit, reservations.cancel, checkin, checkout,
discount.apply, refund, invoice.edit, revenue.view, rooms.manage, housekeeping, maintenance, maintenance.report,
staff.manage, settings.manage, expenses, inventory, restaurant, audit.view, lost_found`.

Property modules (`properties.modules`) switch permissions off when absent: `restaurant→{restaurant}`,
`inventory→{inventory}`, `expenses→{expenses}`, `maintenance→{maintenance, maintenance.report}`,
`lost_found→{lost_found}`, `audit→{audit.view}`. **The effective set is `me.permissions`; the app drives visibility
from it and never recomputes it.** Rank checks (`can("MANAGER")`) gate settings, staff, room setup, tax, channels.

Approval PIN: discounts/adjustments, removing a line, early checkout, shorter dates, releasing a unit, rate override
→ `discount.apply`; refund → `refund`; credit note → `invoice.edit`; cancel/no-show → `reservations.cancel`. If the
actor lacks the permission the request must carry `{approverId, pin}` of a holder (owner/admin/manager/accountant
may hold PINs).

---

## 3. Cross-cutting behaviour (must be mirrored)

- **Navigation gating** — tabs: Today/Guests/Bookings need `reservations.view`; Rooms needs desk or `housekeeping`
  or `maintenance`; Reports needs `revenue.view`; Settings always; Platform for `superAdmin`. Non-desk roles land on
  Rooms; a propertyless super admin sees only Platform.
- **Billing gate** — `billingStatus` from `/me`: `closed` → blocked screen with switch-property/logout;
  `readonly` → danger banner, every write 403s; `overdue` → warning banner.
- **Forced password change** — `mustChangePassword` → only `POST /api/users/me/password` works; non-dismissable screen.
- **Property switcher** — `POST /api/auth/switch-property` → clear all cached reads → reload `/me` → reset to Today.
- **i18n** — default Hindi; `en.json`/`hi.json` (951 identical keys) reused verbatim; language, text size
  (normal/large) and theme (light/dark/system) persisted per device.
- **Money** — integer paise on the wire; `rupees()` (en-IN grouping, 0 or 2 decimals) and `toPaise()` in `utils/format.ts`.
- **Dates** — display `dd-mm-yyyy`, `HH:mm`; local day key (`yyyy-mm-dd`) computed in local time, never via UTC ISO.
  `unitName(room, bed)` = room, or bed label if it starts with the room number, else `room/bed`.
- **Polling** — Today, Guests, Rooms, Restaurant, Maintenance refresh every 30 s while foregrounded and on
  foreground; unread notifications every 60 s; self-registration QR every 2 s.
- **Offline writes** — only `POST /api/bookings/check-in` and `POST /api/folios/{id}/payments` are queued; each
  carries a client v4 UUID (`clientUuid`) the server treats as an idempotency key. Replay oldest-first on reconnect
  and every 30 s; `2xx` → drop; `5xx`/network → stop and retry later; other `4xx` → move to **Needs attention**
  with the server message. Queue is scoped to user + property.
- **Offline reads** — web caches `/api/auth/me`, `/api/rooms`, `/api/room-types`, `/api/settings`, `/api/property`,
  `/api/bookings*` network-first. Mobile: every list store persists its last payload with `fetchedAt`; screens show
  it with a "last updated" label while refetching; cleared on logout and property switch.
- **CSRF** — `X-Requested-With: pms` on every non-GET.
- **Photos** — camera capture → client-side JPEG compression to 300 KB (ID/guest photos), 400 KB (expense bills),
  600 KB / 1600 px (property photo) → multipart part `file`. Signed URLs from `*-url` endpoints expire in 5 min;
  fetch fresh each time.
- **Printables** — receipts (`/api/receipts/{id}/html|pdf`), POS bills (`/api/restaurant/orders/{id}/bill`) and CSVs
  are authenticated GETs on the API host; the app fetches with the session cookie and shows/shares them.
- **Errors** — JSON `{error, fields?}`; 401 = signed out; 403 = refused (never log out); 409 = state conflict
  (show message, reload); 400 with `fields` = per-field validation.

---

## 4. Feature modules — what each does

Each entry lists the user-facing features and CRUD flows; request/response shapes are in Part B.

### 4.1 Auth & shell

- Sign in with property code + email + password; platform admin signs in with email only (no code). Remember the
  last property code. OTP sign-in by phone/email (send → verify).
- Session: `/me` gives identity, memberships, working property, rank, permissions, billing status.
- Switch property (menu / portfolio); log out (revokes session); list & revoke own sessions.
- Change password (current + new ≥8); forced change when `mustChangePassword`.
- Preferences: language (hi/en), text size, appearance.
- Global booking search (name / phone ≥4 digits / reference prefix, ≤8 hits).
- Header: property name, search, unread-notification badge, user menu.

### 4.2 Today

- Occupancy ring (`booked / (total − blocked)`), free-by-type list, date card.
- Tiles with counts: Arrivals (+ arrived, "show completed"), Departures, In house, Staying on, Booked today,
  Cancelled today, Double bookings (OTA conflicts → link to Channels). No-show flagged banner.
- Stay list rows (guest, phone, units, dates, nights, state chip, balance chip) → stay detail.
- Forecast card (`revenue.view`): 14-night occupancy bars with pager, tiles Occupancy / Room nights / Revenue.
- Primary actions: Check-in, New booking.

### 4.3 Bookings

- **Tape chart**: units grouped by type (rooms then dormitory beds), N days (`tape_chart_days`), per-day occupancy %
  and free count, bars coloured by state with website/OTA icons, blocked bands with reason. Pager, date jump.
  Tap empty cell → check-in (today) or new booking (future) prefilled. Move a stay (room/bed and/or arrival date)
  → `POST /{id}/move` (web: drag; mobile: long-press → sheet).
- **New booking (reservation)**: guest lookup by phone or new guest; arrival/departure dates; room type or a
  particular free unit; adults/children; source (`phone, direct, travel_agent, corporate, group, other`) with group
  name / organisation / GSTIN; special requests; "hold without confirming" (tentative → `pending`, lapses at
  `holdUntil`); WhatsApp opt-in; advance amount + mode; consent. Availability re-queried on date change. Group
  source: multi-select units.
- **Walk-in check-in**: phone lookup / new guest; ID type + last 4 (never a full Aadhaar), address, city, ID photo
  (camera → compress → upload; required unless a skip reason is given when `id_photo_required`); adults/children/
  nights; room type → free unit (dirty/cleaning flagged); advance + deposit + mode; consent; WhatsApp opt-in.
  Self-registration QR: create link, show QR, poll, apply the guest's submission into the form. Queued offline.
- **Stay detail**: header (reference, state, payment status, phone), state-driven actions — Confirm (pending),
  Mark arrived (reserved/pending), Take payment / Check out (checked_in; unpaid balance → override reason + PIN;
  early checkout → discount approval), Invoice (checked_out). Overflow: Add extra, Give discount, Refund, Invoice,
  Edit details, Party (members with unit allocation), Add room, Mark no-show, Cancel.
  Tabs: Accommodation (units with change room / give back), Bill (lines, GST, totals, payments, provisional
  receipt), Guest details, Receipts (invoice/donation/credit note/provisional; print; credit note), Activity (audit).
  Hold-until banner for pending; "Took Ns" after check-in.

### 4.4 Folio, payments, receipts

- Folio = lines (`room_charge, day_use, extra, discount, deposit, deposit_refund, forfeit, adjustment`) with
  CGST/SGST/IGST, payments (`cash, upi, card, bank, cheque, online`; refunds negative), deposit held.
  `balanceDue = total + depositHeld − paid` (computed client-side).
- Take payment (modes from `payment_modes`; queued offline; idempotent). Add extra (category
  `food, restaurant, laundry, room_service, extra_bed, transport, other`). Discount (negative line + reason + PIN).
  Refund (≤ paid, reason, PIN; online refunds go through the gateway). Remove line (reason + PIN).
- Receipts: invoice (or donation when donation mode is CA-confirmed), provisional (for an amount just received),
  credit note against an invoice (amount ≤ remaining, reason, PIN). Gap-free numbering per FY and kind. HTML/PDF
  rendering with printer profile `thermal_58 | thermal_80 | a4`.

### 4.5 Guests

- In-house list (from Today: in house, arrivals, departures with people/nights left/balance) and the register
  (search by name/phone/city/email).
- Guest profile: visits, nights, paid, outstanding; current stay; details; all stays; payments.
- Edit guest (name, mobile, email, address, city, state, country, nationality, ID type/last 4, passport, visa, notes).
- Guest photo and ID document: view via signed URL (audited), take/upload photo.
- Self-registration: create QR link (per booking or walk-in), poll state, apply submission (creates/updates guest and
  copies the ID photo), revoke.

### 4.6 Rooms & housekeeping

- Grid by building/floor: status (`clean, dirty, cleaning, inspected, blocked, maintenance`), type, occupancy
  (occupied / reserved / n of m beds / available), housekeeper, high-priority flag. Filters: All, Mine, Clean,
  Needs cleaning, Out of order. Subtitle counts.
- Room sheet: status transitions (Mark clean, Start cleaning, Mark inspected, Needs cleaning, Unblock, Repair
  done), Block room / Under maintenance with reason, Report a problem, housekeeping assignment (cleaner, priority
  low/normal/high, note ≤300). Optimistic update with revert.

### 4.7 Reports

- Daily: today's collection by mode, occupancy, arrivals/no-shows, departures, unpaid bills (list → stay), cash in
  hand per user with hand-over (manager+), deposits held. Send the daily report now (manager+).
- Period: presets (today, yesterday, this week, this month, last month, custom): occupancy/ADR/RevPAR/revenue/
  expenses/net; revenue lines; bookings made/arrivals/departures/cancellations/no-shows; sources; payments by mode;
  online payment orders (with "Check now"); expenses by category; GST by rate; housekeeping status and cleaned-by;
  maintenance stats; guests who stayed.
- CSV exports: period, month (GSTR-style), police register (last 7 days).
- Forecast (on Today).

### 4.8 Notifications

- Feed (last 50 for the property, filtered by the caller's permissions), unread count, mark all seen.
  Kinds: `check_in, room_dirty, room_ready, new_booking, booking_cancelled, checkout_reminder, payment_received,
payment_failed, payment_short, payment_after_expiry, maintenance, low_stock`; each has a `link` (web path).
- Push (mobile-only, backend already supports it): register FCM token per user; server fans out by role at send
  time; `push_enabled` setting per property; invalid tokens auto-deleted.

### 4.9 Settings

- Rules screen generated from the registry (~70 keys in groups language, stay, reservations, day, people, guests,
  tax, receipts, money, messaging, online, platform). Control per type: BOOL, INT (₹ for `_paise`, unit suffixes,
  min/max), TIME, ENUM, LIST (ordered multi-select), TEXT (maxLength), I18N_TEXT (hi/en). Editability per `who`
  (MANAGER/OWNER/SUPER_ADMIN). Draft → single PATCH; `null` resets to default; changed-count badges; search.
- Property details (name, address, city, state, phone, email, GSTIN, trust reg, 12A, 80G, timezone) and photo.
- Room types (name, rate, extra person, dormitory + beds or max guests, amenities, active) and rooms (single, bulk
  range, edit, in-use flag, dormitory beds add/toggle).
- Tax rules: effective-dated slab tables (up to ₹X → n%, above → m%); owner adds.
- Staff: members with role chips and PIN flag; invite (name, mobile, email, role → one-time password shown once),
  change role, reset password, set approval PIN (4–6 digits; self or owner for others), remove access. Property
  code card. Only owners grant owner/admin.
- Channels: public booking page slug (create, copy, open; on/off follows `online_booking_enabled`), OTA calendar
  links per private room (`airbnb, booking_com, makemytrip, agoda, expedia, other`) with export `.ics` URL, import
  URL, sync now, rotate token, unlink; conflicts list.

### 4.10 Restaurant / POS (`restaurant`)

- Orders (open; toggle settled): for a counter/table or an in-house guest; lines from the menu or ad-hoc;
  quantities; save. Settle: charge to a room (posts one folio line at `restaurant_tax_bp`), pay here (cash/upi/card
  → bill number), cancel with reason. Printable bill.
- Menu (manager+): name, category, price, on/off.

### 4.11 Stock inventory (`inventory`)

- Items by category (`cleaning, linen, toiletries, food, maintenance, stationery`) with unit, on hand, at laundry
  (linen), low-stock flag/threshold; All / Low filter.
- Movements: `purchase` (unit cost), `consumption` (room), `to_laundry`/`from_laundry` (linen), `adjustment`,
  `opening`; history per item. Low-stock notification.

### 4.12 Expenses (`expenses`)

- Month view: total, by category (`utilities, maintenance, salaries, cleaning, supplies, food, marketing, other`),
  list. Add (amount, date, category, vendor, mode `cash, upi, card, bank, cheque`, description, bill image/PDF).
  Void with reason. View bill via signed URL.

### 4.13 Maintenance (`maintenance`)

- Tickets (open / all): room or non-room, issue, description, priority (`low, normal, high, urgent`), status
  (`open, assigned, in_progress, resolved, closed`), assignee (technicians), resolution, takes-room-off-sale.
- Report a problem (`maintenance.report`, also from Rooms); work tickets (`maintenance`). Resolving a ticket that
  took the room off sale returns it as dirty.

### 4.14 Lost & found (`lost_found`)

- Items: description, room, found at/by, status (`held, returned, disposed`), returned to, notes. Add, update status.

### 4.15 Audit log (`audit`)

- Filter by date range, table, free text; entries with actor, action, before/after JSON.

### 4.16 Portfolio

- One card per property the user has `revenue.view` in: occupancy, collection today, in house, arrivals,
  departures, unpaid bills; open (switch) a property.

### 4.17 Offline queue / needs attention

- Offline bar (offline / syncing / n saved / n need attention); Needs-attention list of rejected writes with
  server message and "Done".

### 4.18 Platform admin (`superAdmin`)

- Property list with health (billing, active, quiet ≥14 days, outbox backlog, rooms, users, staying now, 30-day
  bookings, outstanding), filters (all/trial/active/attention/quiet), sort, search, cards/list, CSV export.
- Onboard property (org, property, city, state, phone, owner name/mobile/email, plan) → property code + owner
  password shown once.
- Property page: photo, details, team (reset password), plan, billing status, active switch, modules, internal
  notes, recent changes (needs support access granted by the owner).

---

## 5. Data models (client view)

Verbatim client types live in `frontend/src/lib/types.ts` and are reproduced under each endpoint in Part B:
`Booking`, `BookingUnit`, `Member`, `FreeUnit`, `Today`, `Forecast`, `RoomType`, `Room`, `Occupancy`, `Guest`,
`GuestProfile`, `GuestStay`, `Folio`, `FolioLine`, `Receipt`, `SettingDef`, `CurrentUser`, `Notification`/`Feed`,
tape chart `Chart/Unit/Occupancy`, reports `Daily/Outstanding/Cash/Period/OnlineOrder`, staff `Member`, channels
`Overview/ChannelLink/Conflict`, restaurant `MenuItem/Order/Line`, stock `Item/Movement`, expenses
`Expense/Summary`, maintenance `Ticket`, lost-found `Item`, audit `Entry`, portfolio row, `Property`, `TaxRule`,
search `Hit`, self-registration `NewLink/Registration/Submission`, admin `PropertyHealth/Plan/Member`. The mobile
app hand-writes these in `app/features/<module>/types.ts` from Part B.

---

## 6. Parity gaps and mobile-only additions

| Item                                                               | Status                                                                                                                                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| On-device ID OCR (tesseract.js, digits-only, fills last-4/Aadhaar) | `utils/ocr.ts`: ML Kit / Apple Vision on the phone, the web's `extractId` rule; fills only an empty last-4 and sets Aadhaar, then says so (`ocr.filled`). |
| Drag-and-drop on the tape chart                                    | Replaced by long-press → Move sheet (same endpoint).                                                                                                      |
| Recharts occupancy bars                                            | Drawn with plain views.                                                                                                                                   |
| Marketing landing page on `/login`                                 | Not needed in-app.                                                                                                                                        |
| `/g/[token]`, `/book/[slug]`                                       | Web only; app shows/copies the links and QR.                                                                                                              |
| Razorpay checkout in the desk app                                  | Not present on the desk web app either (only on the public page) — nothing to port.                                                                       |
| Push notifications                                                 | Mobile-only addition (backend ready); needs `data.link` in the FCM payload for deep links.                                                                |
| Sessions screen (`GET/DELETE /api/auth/sessions`)                  | Mobile-only addition; endpoints exist, web has no UI.                                                                                                     |
| Stale-data label on cached lists                                   | Mobile-only addition (engineering rule 8).                                                                                                                |

---

# Part B — API contract, data model, settings, jobs

---

## 7. Auth & conventions

### 7.1 Session cookie

- Login endpoints (`POST /api/auth/login`, `POST /api/auth/otp/verify`) return `Set-Cookie: pms_session=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=<seconds>` (`Secure` when `PMS_COOKIE_SECURE=true`, i.e. production). Cookie name is **`pms_session`**.
- The token is a random 256-bit URL-safe base64 string; only its SHA-256 is stored server-side (`sessions.token_hash`). There is **no bearer-token / Authorization header** alternative: the mobile client must persist and send the cookie (`Cookie: pms_session=...`) on every request. The value is also usable directly from the `Set-Cookie` header if your HTTP stack does not manage a cookie jar.
- Lifetime: `min(session_days across the user's properties, default 30)` days from login, **and** the session dies after 14 idle days (`last_seen_at` older than 14 days). `last_seen_at` is touched at most every 5 minutes.
- Body of a successful login: `{"status":"ok","expiresAt":"<datetime>"}`.
- A session carries `current_property_id` (the "working property"). It is set at login (property-code login, or the user's only membership) and changed with `POST /api/auth/switch-property`. Every tenant endpoint operates on this property; there is no property id in URLs.
- Sessions are stateless server-side apart from that row; no `JSESSIONID`.

### 7.2 CSRF header `X-Requested-With: pms`

Every non-safe request (anything other than `GET`, `HEAD`, `OPTIONS`) made **with a session cookie** must carry the header `X-Requested-With: pms`. Without it the server answers `403 {"error":"Missing X-Requested-With header"}`. Safe to send on every request. Public endpoints (`/api/public/**`) and login endpoints do not require it (they have no session) but tolerate it.

CORS: only `Content-Type` and `X-Requested-With` are allowed request headers; allowed origins are configured (`PMS_ALLOWED_ORIGINS`). A native app is not subject to CORS.

### 7.3 Status-code semantics

| Status | Meaning for the client                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `401`  | No/invalid/expired/revoked session → send the user to login. Produced by Spring's entry point (**empty body**, no JSON).                                                                                                                                                                                                                                                                                                             |
| `403`  | Signed in but refused. JSON body `{"error": "..."}`, sometimes with `"code"`. Do **not** log the user out. Causes: missing `X-Requested-With`; role/permission (`@PreAuthorize`); `ApprovalService` ("Manager approval required", "Wrong approval PIN", "Too many wrong PINs..."); billing gate (see §7.5); `mustChangePassword` (see §7.6); rate-limits on public/login endpoints ("Too many attempts; please wait a few minutes"). |
| `402`  | **Not used.** Billing problems are `403` with a message (see §7.5).                                                                                                                                                                                                                                                                                                                                                                  |
| `400`  | `BadRequestException` / validation. Body `{"error":"..."}` or `{"error":"Validation failed","fields":{"<field>":"<message>"}}` for `@Valid` bodies. `IllegalArgumentException` → `{"error":"Invalid request"}`.                                                                                                                                                                                                                      |
| `404`  | `{"error":"<Entity name>"}` e.g. `{"error":"Booking"}`; public endpoints give friendly text.                                                                                                                                                                                                                                                                                                                                         |
| `409`  | `ConflictException` (state machine violations, e.g. "Booking is checked_out", "Folio is settled", "Balance of ₹… is unpaid…") and DB conflicts: "That room or bed is already taken for those dates", "A room with that number already exists", "That email already belongs to someone else", generic "The change conflicts with existing data".                                                                                      |
| `413`  | Non-multipart body > 1 MiB → `{"error":"Request too large"}`.                                                                                                                                                                                                                                                                                                                                                                        |
| `500`  | `{"error":"Something went wrong"}`.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `204`  | Successful writes with no body (`ResponseEntity<Void>`); note `DELETE /api/channels/links/{id}` returns `200` with empty body.                                                                                                                                                                                                                                                                                                       |

### 7.4 Error body shape

```json
{ "error": "human readable message", "fields": { "fieldName": "message" } }
```

`fields` is present only for bean-validation failures; otherwise omitted (Jackson `default-property-inclusion: non_null`). Special: `{"error":"Set your own password to continue","code":"password_change_required"}`.

### 7.5 Billing gate (`BillingGate` filter)

`CurrentUser.billingStatus` (from `GET /api/auth/me`) is one of `trial | active | overdue | readonly | closed` (null when no working property). Applies to every path **except** `/api/auth/**`, `/api/admin/**`, `/api/public/**`, `/api/files/**`:

- `overdue` → nothing is blocked; the app should show a banner.
- `readonly` → every non-GET/HEAD/OPTIONS request answers `403 {"error":"The subscription is unpaid, so this property is read-only. Contact support."}`.
- `closed` → every request (reads too) answers `403 {"error":"This property's account is closed. Contact support."}`.

### 7.6 Forced password change

If `me.mustChangePassword == true`, every request except `/api/auth/**` and `POST /api/users/me/password` answers `403 {"error":"Set your own password to continue","code":"password_change_required"}`. Show the change-password screen and call `POST /api/users/me/password`.

### 7.7 Roles, ranks and permissions (`Permissions.java`)

Stored roles (`property_users.role`, string): `owner, admin, manager, receptionist, staff, housekeeping, accountant, maintenance`.

Rank mapping: `owner→OWNER`; `admin, manager→MANAGER`; `receptionist, staff→STAFF`; others→`LIMITED`. Authorities granted: `ROLE_USER`, `ROLE_<rank>` for every rank at or below the user's, `ROLE_SUPER_ADMIN` if `users.is_super_admin`, plus `PERM_<permission>` for each permission.

Permissions: `reservations.view, reservations.create, reservations.edit, reservations.cancel, checkin, checkout, discount.apply, refund, invoice.edit, revenue.view, rooms.manage, housekeeping, maintenance, maintenance.report, staff.manage, settings.manage, expenses, inventory, restaurant, audit.view, lost_found`.

| Role                | Permissions                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| owner, admin        | all                                                                                                                                      |
| manager             | all except `staff.manage`                                                                                                                |
| receptionist, staff | `reservations.view, reservations.create, reservations.edit, checkin, checkout, housekeeping, maintenance.report, restaurant, lost_found` |
| housekeeping        | `housekeeping, maintenance.report, inventory, lost_found`                                                                                |
| maintenance         | `maintenance, maintenance.report`                                                                                                        |
| accountant          | `reservations.view, revenue.view, refund, invoice.edit, expenses, inventory, audit.view`                                                 |

Modules (`properties.modules`, default all on) remove permissions when off: `restaurant→{restaurant}`, `inventory→{inventory}`, `expenses→{expenses}`, `maintenance→{maintenance, maintenance.report}`, `lost_found→{lost_found}`, `audit→{audit.view}`. The effective set is what `me.permissions` returns — drive UI visibility from it.

### 7.8 Approvals (`approverId` + `pin`)

Actions that reduce a bill or override a rule accept `approverId: uuid?` and `pin: string?`. Rule (`ApprovalService.require(actor, permission, approverId, pin)`):

- If the actor's own permissions include the needed permission → approved as themselves; `pin` ignored.
- Else `pin` is required (4–6 digits) and must match the approval PIN of an **active** member of the property whose role holds that permission. If `approverId` is given and differs from the actor, only that person's PIN is checked; otherwise any holder's PIN. Returns the approver's user id, recorded on the audited change.
- Failures: `403 Manager approval required` (no pin), `403 Wrong approval PIN`, `403 Too many wrong PINs; try again in a few minutes` (5 wrong in 15 min per actor).
- Permission needed per action: discount/adjustment line, remove line, early checkout, shorter dates, release unit, rate override (`ratePaise` on a unit) → `discount.apply`; refund → `refund`; credit note → `invoice.edit`; cancel / no-show → `reservations.cancel`.

### 7.9 Idempotency (`clientUuid`)

Offline-queue replays are made safe by a client-generated UUID:

- `POST /api/bookings/check-in` and `POST /api/bookings/reserve`: `clientUuid` stored in `bookings.client_uuid` (unique per property). A replay returns the existing booking (200, same shape) instead of creating another.
- `POST /api/folios/{id}/payments` and `/refunds`: `PaymentInput.clientUuid` stored in `payments.client_uuid`; a replayed payment returns the folio unchanged.
- Public `POST /api/public/book/{slug}`: `clientUuid` matched on `source='website'`.
  Always generate a fresh v4 UUID per logical action and reuse it on retry.

### 7.10 Multipart uploads

`multipart/form-data` with a single part named **`file`**. Server-wide limits: 5 MB per file, 6 MB per request. Content type is verified against magic bytes (`Uploads.checked`): accepted `image/jpeg`, `image/png`, `image/webp` (and `application/pdf` for expense receipts). Additional limits:

- Guest ID photo / guest photo / self-registration photo: `≤ id_photo_max_kb × 2` KB (default 600 KB) — compress client-side to `id_photo_max_kb` (default 300 KB).
- Property photo (desk and admin): ≤ 5 MB.
- Expense receipt: ≤ 5 MB, image or PDF.
  Files are stored in object storage and served only through short-lived signed URLs (`/api/files/**?exp=&sig=` for local storage, or S3 presigned URLs), obtained from the `*-url` endpoints; URLs expire after 5 minutes (24 h for WhatsApp attachments).

### 7.11 Public (no session) endpoints

`/api/public/**`, `/api/auth/otp/**`, `/api/auth/login`, `/api/health`, `/api/files/**`, `/actuator/health/**`. Everything else under `/api/**` needs a session; `/api/admin/**` additionally requires `ROLE_SUPER_ADMIN`. Anything outside `/api` is denied. Public endpoints are rate-limited per client IP (30/min default; login 10 OTP sends, 20 verifies; booking 5/min; payment retry 10/min) → `403`.

### 7.12 JSON conventions

- Jackson omits `null` fields entirely (`non_null`). Treat every field as optional-on-read unless marked non-null below; primitives (`int`, `long`, `boolean`) are always present.
- Dates/times are ISO strings (`write-dates-as-timestamps: false`). `OffsetDateTime` → `2026-09-27T14:05:00.123456+05:30`; `LocalDate` → `2026-09-27`; `LocalTime` → `10:00`.
- Records serialize their components only; derived methods (`Folio.balanceDuePaise()`, `Line.totalPaise()`, `Unit.label()`) are **not** in the JSON — compute client-side (`balanceDue = totalPaise + depositHeldPaise − paidPaise`).
- Money is integer paise (`long`). `Money.format` strings (e.g. `"₹1,200.00"`) appear only where noted.
- The property's timezone (`properties.timezone`, default `Asia/Kolkata`) governs "today", business days and `line_date`.
- Unknown JSON fields in request bodies are ignored; missing primitives default to `0/false`.

---

## 8. Endpoints by module

### 8.1 Auth — `AuthController` (`/api/auth`)

Records: `TargetRequest{target: string!}`, `VerifyRequest{target!, code!, deviceName?}`, `LoginRequest{email?, code?, password!, deviceName?}`, `SwitchRequest{propertyId: uuid}`.

`CurrentUser` (response of `/me`):

```
{ id: uuid, name: string, superAdmin: bool, sessionId: uuid, propertyId: uuid?, role: "LIMITED"|"STAFF"|"MANAGER"|"OWNER"|null,
  memberships: [{ propertyId: uuid, propertyName: string, role: Role, position: string }],
  position: string?   // stored role: owner|admin|manager|receptionist|staff|housekeeping|accountant|maintenance
  permissions: string[], billingStatus: "trial"|"active"|"overdue"|"readonly"|"closed"|null, mustChangePassword: bool }
```

`SessionView{id: uuid, deviceName: string, createdAt: datetime, lastSeenAt: datetime, current: bool}`.

| Method & path                    | Auth        | Request                                               | Response                                              | Notes                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ----------- | ----------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/otp/send`        | public      | `{target}` phone (10 digits, `+91` stripped) or email | `{"status":"sent"}`                                   | Same answer for unknown targets. 3 sends per 15 min per target (400 "Too many codes requested…"); 10/min per IP (403). 400 if SMS/email provider is `off`. OTP: 6 digits, TTL 5 min, 5 verify attempts.                                                                                                                                                                       |
| `POST /api/auth/otp/verify`      | public      | `{target, code, deviceName?}`                         | `{"status":"ok","expiresAt":datetime}` + `Set-Cookie` | 400 "Wrong or expired code" / "Too many wrong attempts. Request a new code."                                                                                                                                                                                                                                                                                                  |
| `POST /api/auth/login`           | public      | `{email, code?, password, deviceName?}`               | `{"status":"ok","expiresAt"}` + `Set-Cookie`          | `code` = property code (e.g. `DH1234`, alphanumerics, case-insensitive) → property login for an active member; without `code` → platform (super admin) login by email. Wrong → 400 "Wrong property code, email or password". Lockouts 403 after 10 wrong per account+IP / 50 per IP / 100 per account in 15 min. When logging in by code the session starts in that property. |
| `GET /api/auth/me`               | any session | —                                                     | `CurrentUser`                                         | Works in every billing state and under mustChangePassword.                                                                                                                                                                                                                                                                                                                    |
| `POST /api/auth/switch-property` | any session | `{propertyId}`                                        | 204                                                   | 403 "Not a member of that property". Then re-fetch `/me`.                                                                                                                                                                                                                                                                                                                     |
| `POST /api/auth/logout`          | any session | —                                                     | 204 + clears cookie                                   | Revokes this session.                                                                                                                                                                                                                                                                                                                                                         |
| `GET /api/auth/sessions`         | any session | —                                                     | `SessionView[]`                                       | Live sessions of this user, newest activity first.                                                                                                                                                                                                                                                                                                                            |
| `DELETE /api/auth/sessions/{id}` | any session | —                                                     | 204                                                   | Revoke one of your own sessions.                                                                                                                                                                                                                                                                                                                                              |

### 8.2 Health — `HealthController`

| Method & path             | Auth   | Response                           |
| ------------------------- | ------ | ---------------------------------- |
| `GET /api/health`         | public | `{"status":"ok"}` (500 if DB down) |
| `GET /actuator/health/**` | public | Spring actuator liveness/readiness |

### 8.3 Bookings — `BookingController` (`/api/bookings`, class default `STAFF`)

**Booking** (the response of almost every endpoint here):

```
{ id: uuid, guestId: uuid, guestName: string, guestPhone: string, state: BookingState, source: BookingSource,
  arriveAt: datetime, departAt: datetime, checkedInAt: datetime?, checkedOutAt: datetime?,
  adults: int, children: int, memberCount: int, purpose: string, notes: string,
  consentAt: datetime?, whatsappOptIn: bool, flaggedNoshowAt: datetime?, cancelReason: string?,
  folioId: uuid?, balanceDuePaise: long, units: Unit[], members: Member[], createdAt: datetime,
  totalPaise: long, paidPaise: long, paymentStatus: "unpaid"|"partial"|"paid",
  specialRequests: string?, groupName: string?, organization: string?, billingGstin: string?, holdUntil: datetime? }
Unit   { id: uuid, roomId: uuid, roomNumber: string, bedId: uuid?, bedLabel: string?, ratePaise: long, arriveAt: datetime, departAt: datetime, autoAssigned: bool }
Member { id: uuid?, name: string, adult: bool, idType: IdType?, idLast4: string?, unitId: uuid? }
```

`BookingState`: `pending | reserved | checked_in | checked_out | no_show | cancelled`. `BookingSource`: `walk_in | phone | direct | travel_agent | corporate | group | other | website | ota` (desk may send the first seven). `IdType`: `aadhaar | voter | dl | passport | other`.

Request records:

```
UnitRequest        { roomId: uuid, bedId: uuid?, ratePaise: long? }       // ratePaise = price override → needs discount.apply
GuestInput         { name!, phone, city, address, nationality, idType, idLast4, passportNo, visaNo, visaExpiry: date, notes, email, state, country }
Details            { specialRequests?, groupName?, organization?, billingGstin? }
CheckInRequest     { guestId: uuid? | newGuest: GuestInput?, units: UnitRequest[]!, nights: int?, departAt: datetime?, adults: int, children: int,
                     members: Member[]?, purpose: string?, notes: string?, consent: bool, whatsappOptIn: bool, idPhotoSkippedReason: string?,
                     advancePaise: long?, advanceMode: PaymentMode? (default "cash"), depositPaise: long?, clientUuid: uuid?, details: Details? }
ReservationRequest { guestId? | newGuest?, roomTypeId: uuid? (auto-assign when units empty), units: UnitRequest[]?, arriveAt: datetime!, departAt: datetime!,
                     adults, children, purpose?, notes?, consent: bool, whatsappOptIn: bool, advancePaise?, advanceMode? (default "upi"),
                     clientUuid?, source?: walk_in|phone|direct|travel_agent|corporate|group|other (default "phone"), tentative: bool?, details? }
Approval           { approverId: uuid?, pin: string? }
CheckOutInput      { departAt: datetime?, overrideReason: string?, approverId?, pin? }
DatesInput         { departAt: datetime!, approverId?, pin? }
ReasonInput        { reason: string!, approverId?, pin? }
ChangeUnitInput    { target: UnitRequest!, approverId?, pin? }
MoveInput          { unitId: uuid?, roomId: uuid?, bedId: uuid?, arriveOn: date? }
DetailsInput       { details: Details?, notes: string? }
```

Response records: `SearchHit{id, state, arriveAt, departAt, guestName, phone, units: string}`; `Activity{at: datetime, table: string, action: string, userName: string?}`; `FreeUnit{roomId, bedId?, roomNumber, bedLabel?, roomTypeId, typeName, ratePaise, dormitory: bool, status: RoomStatus, building: string, floor: int}`.

| Method & path                                                    | Auth                                                        | Request              | Response                                                                                                                                                                                                                                                                            | Notes                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/bookings/today`                                        | `PERM_reservations.view`                                    | —                    | `{date: date, arrivals: Booking[], arrived: Booking[], inHouse: Booking[], departures: Booking[], flaggedNoShow: Booking[], booked: Booking[], cancelled: Booking[], freeByType: [{type_name, free}], channelConflicts: int, totalUnits: int, blockedUnits: int, bookedUnits: int}` | The dashboard call. `arrivals` = reserved/pending arriving today; `booked`/`cancelled` = created/cancelled today.                                                                                                                                                                                                                                                                          |
| `GET /api/bookings/tape-chart?start=date&days=int`               | `PERM_reservations.view`                                    | —                    | `{start: date, days: int, units: [{room_id, number, floor, status, blocked_reason, type_name, is_dormitory, bed_id, label}], occupancy: [{unit_id, room_id, bed_id, arrive_at, depart_at, booking_id, state, source, guest_name}]}`                                                 | `days` clamped 1..60, default `tape_chart_days`. Raw snake_case rows.                                                                                                                                                                                                                                                                                                                      |
| `GET /api/bookings/search?q=`                                    | `PERM_reservations.view`                                    | —                    | `SearchHit[]` (≤ 8)                                                                                                                                                                                                                                                                 | Name ilike, phone (≥4 digits), or booking-id prefix. `q` < 2 chars → `[]`.                                                                                                                                                                                                                                                                                                                 |
| `GET /api/bookings/availability?arrive=datetime&depart=datetime` | `PERM_reservations.view`                                    | —                    | `FreeUnit[]`                                                                                                                                                                                                                                                                        | Free rooms/beds for the whole span; advisory (DB constraint decides).                                                                                                                                                                                                                                                                                                                      |
| `GET /api/bookings/{id}`                                         | `PERM_reservations.view`                                    | —                    | `Booking`                                                                                                                                                                                                                                                                           | 404 `{"error":"Booking"}`                                                                                                                                                                                                                                                                                                                                                                  |
| `GET /api/bookings/{id}/activity`                                | `PERM_reservations.view`                                    | —                    | `Activity[]` (≤ 60, newest first)                                                                                                                                                                                                                                                   | From audit log across booking, units, folio, lines, payments, receipts.                                                                                                                                                                                                                                                                                                                    |
| `POST /api/bookings/check-in`                                    | `PERM_checkin`                                              | `CheckInRequest`     | `Booking` (state `checked_in`)                                                                                                                                                                                                                                                      | Walk-in. Departure = `departAt` or `nights` (default 1) at `checkout_time`. 400s: consent required (if `consent_required`), no units, ID photo required (if `id_photo_required` and guest has none and no `idPhotoSkippedReason`). Any `ratePaise` needs `discount.apply` (403 otherwise). Creates folio, room charges, deposit line, advance payment. Notifies housekeeping (`check_in`). |
| `POST /api/bookings/reserve`                                     | `PERM_reservations.create`                                  | `ReservationRequest` | `Booking` (`reserved`, or `pending` when `tentative`)                                                                                                                                                                                                                               | `tentative` → `holdUntil = now + tentative_hold_hours`; rooms auto-released when it lapses. Empty `units` → auto-assign from `roomTypeId`. Advance recorded with `advanceMode`. Sends WhatsApp confirmation (if not tentative).                                                                                                                                                            |
| `POST /api/bookings/{id}/arrive`                                 | `PERM_checkin`                                              | —                    | `Booking` (`checked_in`)                                                                                                                                                                                                                                                            | reserved/pending → checked_in. 409 if room off-sale (blocked/maintenance).                                                                                                                                                                                                                                                                                                                 |
| `POST /api/bookings/{id}/check-out`                              | `PERM_checkout`                                             | `CheckOutInput?`     | `Booking` (`checked_out`)                                                                                                                                                                                                                                                           | Only from `checked_in`. Early departure lowers bill → needs discount approval (403 with amount). Unpaid balance → 409 unless `overrideReason` + approval → folio `written_off`. Overpaid → 409 "refund first". Rooms → `dirty`.                                                                                                                                                            |
| `PATCH /api/bookings/{id}/dates`                                 | `PERM_reservations.edit`                                    | `DatesInput`         | `Booking`                                                                                                                                                                                                                                                                           | Change departure. Earlier than current → approval (`discount.apply`). 409 for checked_out/cancelled/no_show.                                                                                                                                                                                                                                                                               |
| `PATCH /api/bookings/{id}/units/{unitId}`                        | `PERM_reservations.edit`                                    | `ChangeUnitInput`    | `Booking`                                                                                                                                                                                                                                                                           | Room/bed transfer for remaining nights; `target.ratePaise` needs approval.                                                                                                                                                                                                                                                                                                                 |
| `POST /api/bookings/{id}/move`                                   | `PERM_reservations.edit`                                    | `MoveInput`          | `Booking`                                                                                                                                                                                                                                                                           | Calendar drag: shift arrival date (reserved/pending only, not into past) and/or move one unit.                                                                                                                                                                                                                                                                                             |
| `POST /api/bookings/{id}/cancel`                                 | `PERM_reservations.edit` (+ `reservations.cancel` approval) | `ReasonInput`        | `Booking` (`cancelled`)                                                                                                                                                                                                                                                             | Only reserved/pending. `reason` required. Releases units and removes room charges (any advance stays on the folio as credit to refund via `/refunds`); notifies `booking_cancelled`; WhatsApp to opted-in guest when `whatsapp_guest_updates`.                                                                                                                                             |
| `POST /api/bookings/{id}/no-show`                                | `PERM_reservations.edit` (+ `reservations.cancel` approval) | `Approval?`          | `Booking` (`no_show`)                                                                                                                                                                                                                                                               | Only reserved/pending. Applies `noshow_policy` (`forfeit` keeps advance as `forfeit` line; `refund` refunds cash; `partial` keeps `noshow_partial_pct`).                                                                                                                                                                                                                                   |
| `POST /api/bookings/{id}/confirm`                                | `PERM_reservations.edit`                                    | —                    | `Booking` (`reserved`)                                                                                                                                                                                                                                                              | Only from `pending`. Sends confirmation message.                                                                                                                                                                                                                                                                                                                                           |
| `PATCH /api/bookings/{id}`                                       | `PERM_reservations.edit`                                    | `DetailsInput`       | `Booking`                                                                                                                                                                                                                                                                           | Update special requests / group / organisation / GSTIN / notes.                                                                                                                                                                                                                                                                                                                            |
| `POST /api/bookings/{id}/units`                                  | `PERM_reservations.edit`                                    | `UnitRequest`        | `Booking`                                                                                                                                                                                                                                                                           | Add another room/bed for the remaining nights.                                                                                                                                                                                                                                                                                                                                             |
| `POST /api/bookings/{id}/units/{unitId}/release`                 | `PERM_reservations.edit` (+ `discount.apply` approval)      | `Approval?`          | `Booking`                                                                                                                                                                                                                                                                           | Release one unit early (part of a group leaves).                                                                                                                                                                                                                                                                                                                                           |
| `PUT /api/bookings/{id}/members`                                 | `PERM_reservations.edit`                                    | `Member[]`           | `Booking`                                                                                                                                                                                                                                                                           | Replace the party list (names for the police register, `unitId` = where they sleep). Updates `memberCount`, `adults`, `children`.                                                                                                                                                                                                                                                          |

### 8.4 Folios (bills) — `FolioController` (`/api/folios`, class default `STAFF`)

```
Folio   { id: uuid, bookingId: uuid, status: "open"|"settled"|"written_off", totalPaise: long, taxPaise: long, paidPaise: long, depositHeldPaise: long,
          lines: Line[], payments: Payment[] }
Line    { id, kind: LineKind, description: string, qty: int, unitPaise: long, taxRateBp: int, cgstPaise: long, sgstPaise: long, lineDate: date, auto: bool,
          reason: string?, approvedBy: uuid?, igstPaise: long, category: string? }
Payment { id, mode: PaymentMode, amountPaise: long (negative for refunds), reference: string, refund: bool, reason: string?, receivedAt: datetime, receivedBy: uuid?, approvedBy: uuid? }
LineKind: room_charge | day_use | extra | discount | deposit | deposit_refund | forfeit | adjustment   (manual kinds: extra, discount, deposit, deposit_refund, forfeit, adjustment)
PaymentMode: cash | upi | card | bank | cheque | online   (desk may use only the modes in settings.payment_modes; "online" only via gateway)
LineInput    { kind: LineKind!, description: string!, qty: int (≥1), unitPaise: long (negative for discount/adjustment), lineDate: date?, reason: string?, category: string? }
PaymentInput { mode: PaymentMode!, amountPaise: long (>0), reference: string?, receivedAt: datetime?, reason: string? (required for refunds), clientUuid: uuid? }
LineRequest       { line: LineInput, approverId?, pin? }
RemoveLineRequest { reason: string, approverId?, pin? }
RefundRequest     { payment: PaymentInput, approverId?, pin? }
CreditNoteRequest { amountPaise: long, reason: string, approverId?, pin? }
Receipt { id: uuid, folioId: uuid, kind: "invoice"|"donation"|"credit_note"|"provisional"|"pos_bill", number: string, fy: string (e.g. "2026-27"), amountPaise: long,
          snapshot: object (immutable copy of what was printed), referencesReceiptId: uuid?, issuedAt: datetime, pdfKey: string? }
```

Derived: `balanceDue = totalPaise + depositHeldPaise − paidPaise`. `total` excludes deposits.

| Method & path                                                 | Auth                                                            | Request                              | Response                                                        | Notes                                                                                                                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/folios/{id}`                                        | `PERM_reservations.view`                                        | —                                    | `Folio`                                                         |                                                                                                                                                            |
| `GET /api/folios/by-booking/{bookingId}`                      | `PERM_reservations.view`                                        | —                                    | `Folio`                                                         |                                                                                                                                                            |
| `POST /api/folios/{id}/lines`                                 | STAFF (+ `discount.apply` approval for `discount`/`adjustment`) | `LineRequest`                        | `Folio`                                                         | 400 unknown kind / qty<1 / blank description; discounts must be negative with a reason. Tax computed server-side.                                          |
| `DELETE /api/folios/{id}/lines/{lineId}`                      | STAFF (+ `discount.apply` approval)                             | `RemoveLineRequest` (body on DELETE) | `Folio`                                                         |                                                                                                                                                            |
| `POST /api/folios/{id}/payments`                              | STAFF                                                           | `PaymentInput`                       | `Folio`                                                         | 400 amount ≤0 / mode not enabled; 409 folio not open. Idempotent via `clientUuid`. Notifies `payment_received`; WhatsApp to opted-in guest if enabled.     |
| `POST /api/folios/{id}/refunds`                               | `STAFF or PERM_refund` (+ `refund` approval)                    | `RefundRequest`                      | `Folio`                                                         | Reason required; cannot exceed `paidPaise`. `payment.mode == "online"` refunds through the gateway (`PaymentService.refund`).                              |
| `GET /api/folios/{id}/receipts`                               | `PERM_reservations.view`                                        | —                                    | `Receipt[]`                                                     |                                                                                                                                                            |
| `POST /api/folios/{id}/receipts/invoice`                      | `STAFF or PERM_invoice.edit`                                    | —                                    | `Receipt`                                                       | Kind `invoice`, or `donation` when donation mode is on and CA-confirmed. Number from `receipt_number_format`. Queues WhatsApp `checkout_receipt` with PDF. |
| `POST /api/folios/{id}/receipts/provisional?amountPaise=long` | STAFF                                                           | query param                          | `Receipt`                                                       | Receipt for money just received (advance). `amountPaise` > 0.                                                                                              |
| `POST /api/folios/receipts/{receiptId}/credit-note`           | `STAFF or PERM_invoice.edit` (+ `invoice.edit` approval)        | `CreditNoteRequest`                  | `Receipt` (kind `credit_note`, `referencesReceiptId` = invoice) | 400 unless target is invoice/donation, amount>0, reason present, ≤ remaining invoice amount.                                                               |

### 8.5 Online payments (desk view) — `PaymentController` (`/api/payments/online`, `PERM_revenue.view`)

```
Order { id: uuid, bookingId: uuid, guestName: string, gatewayOrderId: string, amountPaise: long, status: "created"|"paid"|"failed"|"expired",
        gatewayPaymentId: string?, paymentId: uuid?, failureReason: string?, createdAt: datetime, updatedAt: datetime }
```

| Method & path                                | Auth                | Request | Response                           | Notes                                                                |
| -------------------------------------------- | ------------------- | ------- | ---------------------------------- | -------------------------------------------------------------------- |
| `GET /api/payments/online?from=date&to=date` | `PERM_revenue.view` | —       | `{enabled: bool, orders: Order[]}` | Orders created in the range (≤500).                                  |
| `POST /api/payments/online/{id}/check`       | `PERM_revenue.view` | —       | `Order`                            | Ask the gateway now and apply the result. 400 if gateway not set up. |

### 8.6 Guests — `GuestController` (`/api/guests`, class default `STAFF`)

```
Guest { id: uuid, name: string, phone: string, city: string, address: string, nationality: string (default "IN"), idType: IdType?, idLast4: string?,
        hasIdPhoto: bool, passportNo: string?, visaNo: string?, visaExpiry: date?, notes: string, email: string?, state: string, country: string, hasPhoto: bool }
GuestInput { name!, phone (10 digits or empty), city, address, nationality, idType: IdType?, idLast4 (exactly 4 alnum), passportNo, visaNo, visaExpiry: date, notes, email, state, country }
Stay    { bookingId, state, arriveAt, departAt, units: string, totalPaise, paidPaise, balancePaise, source }
Profile { guest: Guest, current: Stay?, stays: Stay[], payments: [{receivedAt, mode, amountPaise, refund: bool, bookingId}], visits: int, nights: long, spentPaise: long, outstandingPaise: long }
```

Validation: any 12-digit number anywhere → 400 "Do not enter a full Aadhaar number; only the last 4 digits".

| Method & path                       | Auth                     | Request                          | Response          | Notes                                        |
| ----------------------------------- | ------------------------ | -------------------------------- | ----------------- | -------------------------------------------- |
| `GET /api/guests?phone=` or `?q=`   | `PERM_reservations.view` | —                                | `Guest[]`         | `phone` exact lookup, else free-text search. |
| `GET /api/guests/{id}`              | `PERM_reservations.view` | —                                | `Guest`           |                                              |
| `POST /api/guests`                  | STAFF                    | `GuestInput`                     | `Guest`           |                                              |
| `PUT /api/guests/{id}`              | STAFF                    | `GuestInput`                     | `Guest`           |                                              |
| `POST /api/guests/{id}/id-photo`    | STAFF                    | multipart `file` (jpeg/png/webp) | `Guest`           | ID document photo.                           |
| `GET /api/guests/{id}/id-photo-url` | `PERM_checkin`           | —                                | `{"url": string}` | Signed URL, ~5 min. Access is audited.       |
| `GET /api/guests/{id}/profile`      | `PERM_reservations.view` | —                                | `Profile`         |                                              |
| `POST /api/guests/{id}/photo`       | STAFF                    | multipart `file`                 | `Guest`           | Guest's face photo.                          |
| `GET /api/guests/{id}/photo-url`    | `PERM_checkin`           | —                                | `{"url": string}` |                                              |

### 8.7 Rooms & housekeeping — `InventoryController` (`/api`, class default `STAFF`; `SEES_ROOMS` = `STAFF or PERM_housekeeping or PERM_maintenance or PERM_reservations.view`)

```
RoomType { id, name, baseRatePaise: long, maxOccupancy: int, extraPersonPaise: long, dormitory: bool, bedCount: int, sortOrder: int, active: bool, amenities: string[] }
RoomTypeInput { name, baseRatePaise, maxOccupancy, extraPersonPaise, dormitory, bedCount, sortOrder, active, amenities: string[] }
Room { id, roomTypeId, roomTypeName, number: string, floor: int, status: RoomStatus, blockedReason: string?, blockedUntil: datetime?, active: bool,
       beds: [{id, label, active, occupancy: Occupancy?}], building: string, housekeeperId: uuid?, housekeeperName: string?, hkPriority: "low"|"normal"|"high", hkNote: string, occupancy: Occupancy? }
Occupancy { state: string ("checked_in" = occupied, "reserved"/"pending" = arriving today), bookingId, guestName, departAt }
RoomStatus: clean | dirty | cleaning | inspected | blocked | maintenance   (off-sale: blocked, maintenance)
RoomInput { roomTypeId: uuid, number: string, floor: int, active: bool, building: string }
BulkRoomsInput { roomTypeId, range: "101-110", floor, building }
StatusInput { status: RoomStatus!, reason: string?, until: datetime? }
HousekeepingInput { housekeeperId: uuid?, priority: "low"|"normal"|"high"? (default normal), note: string? (≤300) }
Person { id: uuid, name: string, role: string }
BedInput { label: string?, active: bool? }
```

| Method & path                        | Auth                                    | Request             | Response     | Notes                                                                                                                                                                                                               |
| ------------------------------------ | --------------------------------------- | ------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/room-types`                | SEES_ROOMS                              | —                   | `RoomType[]` |                                                                                                                                                                                                                     |
| `POST /api/room-types`               | MANAGER                                 | `RoomTypeInput`     | `RoomType`   |                                                                                                                                                                                                                     |
| `PUT /api/room-types/{id}`           | MANAGER                                 | `RoomTypeInput`     | `RoomType`   |                                                                                                                                                                                                                     |
| `GET /api/rooms`                     | SEES_ROOMS                              | —                   | `Room[]`     | Includes current occupancy per room/bed.                                                                                                                                                                            |
| `GET /api/rooms/{id}`                | SEES_ROOMS                              | —                   | `Room`       |                                                                                                                                                                                                                     |
| `POST /api/rooms`                    | MANAGER                                 | `RoomInput`         | `Room`       | 409 duplicate number.                                                                                                                                                                                               |
| `POST /api/rooms/bulk`               | MANAGER                                 | `BulkRoomsInput`    | `Room[]`     | Creates numbers in the range.                                                                                                                                                                                       |
| `PUT /api/rooms/{id}`                | MANAGER                                 | `RoomInput`         | `Room`       |                                                                                                                                                                                                                     |
| `PATCH /api/rooms/{id}/status`       | `PERM_housekeeping or PERM_maintenance` | `StatusInput`       | `Room`       | Housekeeping cycle; `blocked`/`maintenance` take the room off sale with `reason`/`until`. clean/inspected clears assignment & resets priority; notifies `room_ready` (to checkin) / `room_dirty` (to housekeeping). |
| `PATCH /api/rooms/{id}/housekeeping` | `PERM_housekeeping`                     | `HousekeepingInput` | `Room`       | Assign cleaner, priority, note.                                                                                                                                                                                     |
| `GET /api/housekeepers`              | `PERM_housekeeping`                     | —                   | `Person[]`   | Members who can clean.                                                                                                                                                                                              |
| `POST /api/rooms/{id}/beds`          | MANAGER                                 | `BedInput{label}`   | `Room`       | Dormitory bed.                                                                                                                                                                                                      |
| `PATCH /api/beds/{id}`               | MANAGER                                 | `BedInput{active}`  | `Room`       | Activate/deactivate a bed (`active` omitted ⇒ true).                                                                                                                                                                |

### 8.8 Settings — `SettingsController` (`/api/settings`, class default `STAFF`)

```
SettingDef { key: string, group: string, type: "BOOL"|"INT"|"TIME"|"ENUM"|"TEXT"|"LIST"|"I18N_TEXT", defaultValue: any, who: "MANAGER"|"OWNER"|"SUPER_ADMIN",
             options: string[]?, min: int?, max: int?, maxLength: int?, description: string }
RegistryView { definitions: SettingDef[], groups: { language, stay, reservations, day, people, guests, tax, receipts, money, messaging, online, platform → label } }
```

| Method & path                | Auth    | Request         | Response                | Notes                                                 |
| ---------------------------- | ------- | --------------- | ----------------------- | ----------------------------------------------------- |
| `GET /api/settings/registry` | LIMITED | —               | `RegistryView`          | Static; render the settings screen from it.           |
| `GET /api/settings`          | LIMITED | —               | `{ <key>: value, ... }` | Resolved values (defaults merged). See §9.6 for keys. |
| `PATCH /api/settings`        | MANAGER | `{ <key>: value | null, ... }`            | resolved map                                          | Partial; `null` resets to default. Each key is validated (type, range, options) and gated by its `who` (MANAGER < OWNER < SUPER_ADMIN) → 400/403. |

### 8.9 Notifications & push — `NotificationController` (`/api/notifications`, class `LIMITED`)

```
Item { id: uuid, kind: string, title: string, body: string, link: string?, createdAt: datetime, unread: bool }
Feed { items: Item[], unread: int }
TokenInput { token: string!, platform: string? (default "web"; use "android"/"ios") }
```

| Method & path                        | Auth    | Request      | Response | Notes                                                                                                                                                                                                                |
| ------------------------------------ | ------- | ------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/notifications`             | LIMITED | —            | `Feed`   | Last 50 items for this property whose `permission` is null or in the caller's permissions. `unread` = newer than the caller's `seen_at`.                                                                             |
| `POST /api/notifications/seen`       | LIMITED | —            | 204      | Marks everything seen (per user per property).                                                                                                                                                                       |
| `POST /api/notifications/push-token` | LIMITED | `TokenInput` | 204      | Registers/refreshes an FCM device token for the **user** (not property). Upsert on token; ≤ 4096 chars. Call after every login and on token refresh. Invalid tokens are deleted automatically when FCM rejects them. |

Notification `kind` values: `check_in, room_dirty, room_ready, new_booking, booking_cancelled, checkout_reminder, payment_received, payment_failed, payment_short, payment_after_expiry, maintenance, low_stock`. `link` values are desk-app routes: `/stays/{bookingId}`, `/rooms`, `/maintenance`, `/inventory`, etc. — map them to mobile screens.

### 8.10 Staff / users — `UserAdminController` (`/api/users`)

```
Member { userId: uuid, name: string, phone: string?, email: string?, role: string, active: bool, hasPin: bool }
InviteInput { name!, phone?, email?, role: one of Permissions.ROLES }
Invited = Member fields flattened + { password: string }     // @JsonUnwrapped; shown once
RoleInput { role }   PinInput { pin: "\\d{4,6}" }   PasswordInput { email?: string, currentPassword?: string, password!: string }
```

| Method & path                   | Auth                | Request         | Response               | Notes                                                                                                                                                                                                                       |
| ------------------------------- | ------------------- | --------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/users`                | MANAGER             | —               | `Member[]`             | Members of the working property.                                                                                                                                                                                            |
| `POST /api/users`               | `PERM_staff.manage` | `InviteInput`   | `Invited`              | Creates or attaches a user with a generated first password (`must_change_password`). Only an owner may grant `owner`/`admin` (403).                                                                                         |
| `POST /api/users/{id}/password` | `PERM_staff.manage` | —               | `{"password": string}` | Reset to a new generated password. 400 for yourself; 403 if the person also works at another property.                                                                                                                      |
| `PATCH /api/users/{id}/role`    | `PERM_staff.manage` | `RoleInput`     | `Member`               | 400 unknown role / own role.                                                                                                                                                                                                |
| `DELETE /api/users/{id}`        | `PERM_staff.manage` | —               | 204                    | Deactivate membership; revokes their sessions at this property. Cannot deactivate yourself.                                                                                                                                 |
| `POST /api/users/{id}/pin`      | LIMITED             | `PinInput`      | 204                    | Set approval PIN for yourself, or anyone if OWNER (403 otherwise). Only approver roles may hold a PIN (400).                                                                                                                |
| `POST /api/users/me/password`   | USER                | `PasswordInput` | 204                    | Set your own password (≥8 chars, ≤128, not common). `currentPassword` required if one exists. Optionally sets `email`. Clears `mustChangePassword`; revokes your other sessions. Allowed even under the forced-change gate. |

### 8.11 Property — `PropertyController` (`/api/property`, class default `STAFF`)

```
Property { id, name, address, city, state, phone, email?, gstin?, trustRegNo?, reg12a?, reg80g?, timezone, code, photoUrl? (signed, expiring) }
PropertyInput { name, address, city, state, phone, email, gstin, trustRegNo, reg12a, reg80g, timezone }
```

| Method & path                | Auth    | Request                        | Response   |
| ---------------------------- | ------- | ------------------------------ | ---------- |
| `GET /api/property`          | LIMITED | —                              | `Property` |
| `PUT /api/property`          | MANAGER | `PropertyInput`                | `Property` |
| `POST /api/property/photo`   | MANAGER | multipart `file` (≤5 MB image) | `Property` |
| `DELETE /api/property/photo` | MANAGER | —                              | `Property` |

### 8.12 Portfolio — `PortfolioController` (`/api/portfolio`, `USER`)

| Method & path        | Auth | Response                                                                                                                                                                                                                                                 |
| -------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/portfolio` | USER | `[{propertyId, propertyName, current: bool, occupancyPct: long, collectedPaise: long, outstandingPaise: long, inHouse: int, arrivals: int, departures: int, totalUnits: int, bookedUnits: int}]` — one row per membership whose role has `revenue.view`. |

### 8.13 Admin back office — `AdminController` (`/api/admin`, `SUPER_ADMIN`; also gated in `SecurityConfig`; never billing-gated)

```
PropertyHealth { propertyId, propertyName, city, state, phone, orgId, orgName, plan: string?, billingStatus, active: bool, rooms: int, users: int, stayingNow: int,
                 bookingsLast30Days: int, lastActivityAt: datetime?, openFolios: int, outstandingPaise: long, outboxPending: int, supportAccess: bool,
                 code: string, modules: string[], createdAt, ownerName?, ownerPhone?, photoUrl?, notes? }
Member { userId, name, phone, role, active }      Plan { code, name, maxRooms: int, monthlyPaise: long }
NewPassword { name, phone, email, password }
NewPropertyInput { orgName!, propertyName!, city, state, phone, ownerName!, ownerPhone, ownerEmail, planCode }
NewPropertyResult { orgId, propertyId, ownerId, ownerPhone, ownerEmail, code, ownerPassword? }
BillingInput { billingStatus: trial|active|overdue|readonly|closed }  PlanInput { planCode }  ModulesInput { modules: string[] }  ActiveInput { active }  NotesInput { notes (≤4000) }
```

| Method & path                                            | Request            | Response                                                                                             |
| -------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| `GET /api/admin/properties`                              | —                  | `PropertyHealth[]`                                                                                   |
| `GET /api/admin/properties/{id}`                         | —                  | `PropertyHealth`                                                                                     |
| `GET /api/admin/properties/{id}/team`                    | —                  | `Member[]`                                                                                           |
| `GET /api/admin/plans`                                   | —                  | `Plan[]` (seeded: basic 20 rooms ₹499, standard 60 rooms ₹999, large ₹1,499)                         |
| `POST /api/admin/properties`                             | `NewPropertyInput` | `NewPropertyResult`                                                                                  |
| `POST /api/admin/properties/{id}/photo`                  | multipart `file`   | `PropertyHealth`                                                                                     |
| `DELETE /api/admin/properties/{id}/photo`                | —                  | `PropertyHealth`                                                                                     |
| `PATCH /api/admin/properties/{id}/active`                | `ActiveInput`      | `PropertyHealth`                                                                                     |
| `PATCH /api/admin/properties/{id}/notes`                 | `NotesInput`       | `PropertyHealth`                                                                                     |
| `PATCH /api/admin/properties/{id}/modules`               | `ModulesInput`     | 204 (400 unknown module)                                                                             |
| `POST /api/admin/properties/{id}/team/{userId}/password` | —                  | `NewPassword` (403 for a super admin)                                                                |
| `GET /api/admin/properties/{id}/activity`                | —                  | `[{...audit rows}]` — 403 unless owner granted support access (`support_access_until` in the future) |
| `PATCH /api/admin/organisations/{id}/billing`            | `BillingInput`     | 204                                                                                                  |
| `PATCH /api/admin/organisations/{id}/plan`               | `PlanInput`        | 204                                                                                                  |

### 8.14 Audit — `AuditController` (`/api/audit`, `PERM_audit.view`)

`Entry { id: uuid, at: datetime, userName: string?, table: string, rowId: string, action: string, before: string? (JSON text), after: string? (JSON text) }`

| Method & path                                        | Request | Response                                           |
| ---------------------------------------------------- | ------- | -------------------------------------------------- |
| `GET /api/audit?from=date&to=date&table=&userId=&q=` | query   | `Entry[]` (≤300, newest first); 400 if `to < from` |
| `GET /api/audit/tables`                              | —       | `string[]` distinct table names                    |

### 8.15 Reports — `ReportController` (`/api/reports`, class default `STAFF`)

| Method & path                                  | Auth                     | Request                                          | Response                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Notes                                                        |
| ---------------------------------------------- | ------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `GET /api/reports/daily?date=`                 | `PERM_revenue.view`      | optional business date                           | `{businessDate, from, to, collections: [{mode, amount, count}], collectedPaise, cashByUser: [{name, amount}], arrivals: int, departures: int, noShows: int, occupiedUnits: long, sellableUnits: long, occupancyPct: long, outstandingCount: long, outstandingPaise: long, depositsHeldPaise: long}`                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Business day runs `business_day_start` → same hour next day. |
| `POST /api/reports/daily/send?date=`           | MANAGER                  | —                                                | same map as `/daily`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Queues WhatsApp/email report to owners/managers now.         |
| `GET /api/reports/forecast?from=date&days=14`  | `PERM_revenue.view`      | —                                                | `{from, to, units, roomNights, occupancyPct, adrPaise, revparPaise, revenuePaise, nights: [{date, sold, revenuePaise, occupancyPct}]}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |                                                              |
| `GET /api/reports/month?month=YYYY-MM`         | `PERM_revenue.view`      | —                                                | `{month, taxableByRate: [{tax_rate_bp, taxable, cgst, sgst, igst}], revenuePaise, taxPaise, nightsSold, occupancyPct, payments: [{mode, received, refunded}], creditNotes: {count, amount}}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |                                                              |
| `GET /api/reports/month.csv?month=`            | `PERM_revenue.view`      | —                                                | `text/csv` attachment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | GSTR-1 style rows.                                           |
| `GET /api/reports/period?from=date&to=date`    | `PERM_revenue.view`      | —                                                | `{from, to, days, occupancy: {units, availableNights, nightsSold, occupancyPct, roomRevenuePaise, adrPaise, revparPaise}, revenue: {lines: [{item, taxable, tax}], totalPaise, taxPaise}, tax: [{tax_rate_bp, taxable, cgst, sgst, igst}], bookings: {made, arrivals, departures, cancellations, noShows}, sources: [{source, bookings, nights, billed}], payments: [{mode, received, refunded, count}], outstanding: {count, amountPaise}, expenses: {byCategory: [{category, amount}], totalPaise}, net: {revenuePaise, expensesPaise, netPaise}, housekeeping: {status: [{status, rooms}], cleaned: [{name, rooms}]}, maintenance: {opened, resolved, avg_hours, open_now, urgent_now}, guests: [{id, name, phone, city, stays, nights, paid}]}` | The all-in-one report.                                       |
| `GET /api/reports/period.csv?from&to`          | `PERM_revenue.view`      | —                                                | `text/csv` (`section,item,field,value`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |                                                              |
| `GET /api/reports/outstanding`                 | `PERM_reservations.view` | —                                                | `[{folio_id, booking_id, guest_name, phone, state, arrive_at, depart_at, due_paise}]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Open folios with money owed.                                 |
| `GET /api/reports/cash-in-hand`                | `PERM_revenue.view`      | —                                                | `[{user_id, name, cash_paise, last_handover_at}]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Cash each user holds since last handover.                    |
| `POST /api/reports/cash-handover`              | MANAGER                  | `{userId: uuid? (default self), notes: string?}` | `{handoverId: uuid, amountPaise: long, amount: "₹…"}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Marks that user's cash payments handed over.                 |
| `GET /api/reports/police-register?from&to`     | MANAGER                  | —                                                | `{from, to, columns: string[], rows: [{id, name, address, city, nationality, id_type, id_last4, phone, arrive_at, depart_at, adults, children, purpose, units, members}]}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Columns from `register_template`.                            |
| `GET /api/reports/police-register.csv?from&to` | MANAGER                  | —                                                | `text/csv` attachment (UTF-8 BOM)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |                                                              |

### 8.16 Restaurant / POS — `RestaurantController` (`/api/restaurant`, class `PERM_restaurant`)

```
MenuItem { id, name, category, pricePaise: long, active: bool, sortOrder: int }   MenuInput { name, category, pricePaise, active?, sortOrder? }
LineInput { menuItemId: uuid?, name: string?, unitPaise: long?, qty: int }      // menu item or ad-hoc line
OrderInput { bookingId: uuid?, tableLabel: string?, lines: LineInput[] }
Order { id, bookingId?, guestName?, units?: string, tableLabel, status: "open"|"posted"|"paid"|"cancelled", taxablePaise, taxRateBp (settings.restaurant_tax_bp), cgstPaise, sgstPaise, totalPaise,
        billNumber?: string, createdByName, createdAt, closedAt?, cancelReason?, lines: [{id, menuItemId?, name, qty, unitPaise}] }
LinesInput { lines: LineInput[] }  PostInput { bookingId? }  PayInput { mode: PaymentMode, reference? }  CancelInput { reason }
```

| Method & path                             | Auth                          | Request       | Response                            | Notes                                                                                                                                                                                 |
| ----------------------------------------- | ----------------------------- | ------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/restaurant/menu`                | `PERM_restaurant`             | —             | `MenuItem[]`                        |                                                                                                                                                                                       |
| `POST /api/restaurant/menu`               | `MANAGER and PERM_restaurant` | `MenuInput`   | `MenuItem`                          |                                                                                                                                                                                       |
| `PUT /api/restaurant/menu/{id}`           | `MANAGER and PERM_restaurant` | `MenuInput`   | `MenuItem`                          |                                                                                                                                                                                       |
| `GET /api/restaurant/orders?all=false`    | `PERM_restaurant`             | —             | `Order[]`                           | Open orders; `all=true` also settled since yesterday (≤200).                                                                                                                          |
| `POST /api/restaurant/orders`             | `PERM_restaurant`             | `OrderInput`  | `Order`                             |                                                                                                                                                                                       |
| `PUT /api/restaurant/orders/{id}/lines`   | `PERM_restaurant`             | `LinesInput`  | `Order`                             | Replace lines (open orders only, 409 otherwise).                                                                                                                                      |
| `POST /api/restaurant/orders/{id}/post`   | `PERM_restaurant`             | `PostInput?`  | `Order` (`posted`)                  | Post to an in-house (`checked_in`) stay's folio as one `extra` line, category `restaurant`, at `restaurant_tax_bp`. `bookingId` from body or the order; 400 if neither / order empty. |
| `POST /api/restaurant/orders/{id}/pay`    | `PERM_restaurant`             | `PayInput`    | `Order` (`paid`, with `billNumber`) | Counter payment; creates a `payments` row with `pos_order_id`.                                                                                                                        |
| `POST /api/restaurant/orders/{id}/cancel` | `PERM_restaurant`             | `CancelInput` | `Order` (`cancelled`)               |                                                                                                                                                                                       |
| `GET /api/restaurant/orders/{id}/bill`    | `PERM_restaurant`             | —             | `text/html`                         | Printable bill.                                                                                                                                                                       |

### 8.17 Expenses — `ExpenseController` (`/api/expenses`, `PERM_expenses`)

```
Expense { id, spentOn: date, category, amountPaise, vendor, paymentMode, description, hasReceipt: bool, voidedAt?: datetime, voidReason?: string, createdByName, createdAt }
ExpenseInput { spentOn: date, category: utilities|maintenance|salaries|cleaning|supplies|food|marketing|other, amountPaise (>0), vendor?, paymentMode: cash|upi|card|bank|cheque, description? }
Summary { from, to, totalPaise, byCategory: {category: long} (all 8 keys), expenses: Expense[] }
```

| Method & path                         | Request                               | Response  |
| ------------------------------------- | ------------------------------------- | --------- |
| `GET /api/expenses?from=date&to=date` | —                                     | `Summary` |
| `POST /api/expenses`                  | `ExpenseInput`                        | `Expense` |
| `POST /api/expenses/{id}/void`        | `{reason}`                            | `Expense` |
| `POST /api/expenses/{id}/receipt`     | multipart `file` (image or PDF ≤5 MB) | `Expense` |
| `GET /api/expenses/{id}/receipt-url`  | —                                     | `{"url"}` |

### 8.18 Stock / supplies — `StockController` (`/api/inventory`, `PERM_inventory`)

```
Item { id, name, category: cleaning|linen|toiletries|food|maintenance|stationery, unit: string (default "pcs"), lowStockThreshold: decimal, active, onHand: decimal, atLaundry: decimal, low: bool }
ItemInput { name, category, unit, lowStockThreshold: decimal, active? }
MovementInput { kind: opening|purchase|consumption|adjustment|to_laundry|from_laundry, qty: decimal (positive; sign applied by kind; adjustment signed), unitCostPaise: long?, roomId: uuid?, note? }
Movement { id, kind, qtyChange: decimal, unitCostPaise?, roomNumber?, note, byName, at: datetime }
PeriodRow { itemId, name, category, unit, opening, purchases, consumption, adjustments, laundry, closing, purchaseCostPaise }
```

| Method & path                                 | Request         | Response                                              |
| --------------------------------------------- | --------------- | ----------------------------------------------------- |
| `GET /api/inventory/items`                    | —               | `Item[]`                                              |
| `POST /api/inventory/items`                   | `ItemInput`     | `Item`                                                |
| `PUT /api/inventory/items/{id}`               | `ItemInput`     | `Item`                                                |
| `POST /api/inventory/items/{id}/movements`    | `MovementInput` | `Item` (notifies `low_stock` when crossing threshold) |
| `GET /api/inventory/items/{id}/movements`     | —               | `Movement[]`                                          |
| `GET /api/inventory/period?from=date&to=date` | —               | `PeriodRow[]`                                         |

### 8.19 Maintenance & lost-and-found — `MaintenanceController` (`/api`)

```
Ticket { id, roomId?, roomNumber?, issue, description, priority: low|normal|high|urgent, status: open|assigned|in_progress|resolved|closed, assignedTo?: uuid, assignedName?,
         resolution?, takesRoomOffSale: bool, reportedByName, createdAt, updatedAt, resolvedAt? }
TicketInput { roomId?, issue!, description?, priority? (default normal), takesRoomOffSale: bool }   // true → room status 'maintenance'
TicketUpdate { status?, assignedTo?: uuid, priority?, resolution? }
Item { id, roomId?, roomNumber?, description, foundAt: datetime, foundByName, status: held|returned|disposed, returnedTo?, notes }
ItemInput { roomId?, description!, notes? }   ItemUpdate { status?, returnedTo?, notes? }
```

| Method & path                      | Auth                                          | Request        | Response   | Notes                                                                          |
| ---------------------------------- | --------------------------------------------- | -------------- | ---------- | ------------------------------------------------------------------------------ |
| `GET /api/maintenance?all=false`   | `PERM_maintenance or PERM_maintenance.report` | —              | `Ticket[]` | Open ones; `all=true` includes resolved/closed.                                |
| `POST /api/maintenance`            | `PERM_maintenance.report`                     | `TicketInput`  | `Ticket`   | Notifies `maintenance` role.                                                   |
| `PATCH /api/maintenance/{id}`      | `PERM_maintenance`                            | `TicketUpdate` | `Ticket`   | Resolving/closing a ticket that took the room off sale puts it back (`dirty`). |
| `GET /api/maintenance/technicians` | `PERM_maintenance`                            | —              | `Person[]` |                                                                                |
| `GET /api/lost-found`              | `PERM_lost_found`                             | —              | `Item[]`   |                                                                                |
| `POST /api/lost-found`             | `PERM_lost_found`                             | `ItemInput`    | `Item`     |                                                                                |
| `PATCH /api/lost-found/{id}`       | `PERM_lost_found`                             | `ItemUpdate`   | `Item`     |                                                                                |

### 8.20 Channels / OTA calendars — `ChannelController` (`/api/channels`, `MANAGER`)

```
Link { id, roomId, roomNumber, channel: airbnb|booking_com|makemytrip|agoda|expedia|other, exportToken: string, importUrl?: string, lastSyncedAt?: datetime, lastError?: string, conflicts: int }
Conflict { id, channel, roomNumber, arriveOn: date, departOn: date, summary, conflict: string }
Overview { bookingSlug?: string, onlineBookingEnabled: bool, links: Link[], conflicts: Conflict[], rooms: [{id, number, typeName}] }
LinkInput { roomId: uuid, channel: string, importUrl?: string }
```

Export URL for an OTA: `{apiUrl}/api/public/calendar/{exportToken}.ics`.

| Method & path                          | Request                | Response           | Notes                                                                                 |
| -------------------------------------- | ---------------------- | ------------------ | ------------------------------------------------------------------------------------- |
| `GET /api/channels`                    | —                      | `Overview`         |                                                                                       |
| `POST /api/channels/links`             | `LinkInput`            | `Link`             | Syncs immediately if `importUrl` set.                                                 |
| `PATCH /api/channels/links/{id}`       | `LinkInput{importUrl}` | `Link`             |                                                                                       |
| `POST /api/channels/links/{id}/rotate` | —                      | `Link`             | New export token.                                                                     |
| `POST /api/channels/links/{id}/sync`   | —                      | `Link`             | Pull the OTA calendar now.                                                            |
| `DELETE /api/channels/links/{id}`      | —                      | 200 empty          |                                                                                       |
| `POST /api/channels/booking-page`      | —                      | `{"slug": string}` | Creates the public booking-page slug if missing. Public page: `{appUrl}/book/{slug}`. |

### 8.21 Public booking page & OTA export — `PublicChannelController` (`/api/public`, no session, rate-limited, `Cache-Control: no-store`)

```
Page { name, city, address, phone, checkinTime: "HH:mm", checkoutTime, today: date, maxNights: int, daysAhead: int, consentRequired: bool, consentText: {hi, en}, payment: "off"|"optional"|"required", advancePct: int, photoUrl? }
Offer { roomTypeId, name, maxOccupancy, dormitory, ratePaise, free: int, nights: long, totalPaise }
OnlineRequest { roomTypeId!, arrive: date!, depart: date!, adults: int, children: int, name!, phone! (10 digits), city?, consent: bool, whatsappOptIn: bool, clientUuid?: uuid, payNow?: bool }
Checkout { provider: "razorpay"|"console", keyId: string, orderId: string, amountPaise: long, currency: "INR", name: string (property), holdUntil: datetime? }
Confirmation { reference: string (first 8 chars of booking id, upper), guestName, propertyName, propertyPhone, roomType, arrive: date, depart: date, nights: long, totalPaise, checkinTime, status: "reserved"|"pending", paidPaise, payment?: Checkout }
VerifyInput { orderId, paymentId, signature }   FailureInput { orderId, reason? }   SimulateInput { orderId, succeed: bool }
```

| Method & path                                                      | Request                                           | Response                          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/public/calendar/{token}[.ics]`                           | —                                                 | `text/calendar`                   | One room's busy nights for an OTA. 404 unknown token.                                                                                                                                                                                                                                                                                                                                                                              |
| `GET /api/public/book/{slug}`                                      | —                                                 | `Page`                            | 404 when slug unknown/inactive or `online_booking_enabled=false`.                                                                                                                                                                                                                                                                                                                                                                  |
| `GET /api/public/book/{slug}/availability?arrive=date&depart=date` | —                                                 | `Offer[]`                         |                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `POST /api/public/book/{slug}`                                     | `OnlineRequest`                                   | `Confirmation`                    | Source `website`. 5/min per IP. Validations: consent (if required), 10-digit phone, dates within `online_booking_days_ahead` / `online_booking_max_nights`, capacity, ≤3 open bookings per phone, ≤40 website bookings per property per day (409). With payment: state `pending`, `holdUntil = now + online_payment_hold_minutes`, `payment` holds the gateway checkout (advance = `online_payment_advance_pct` of total, min ₹1). |
| `POST /api/public/book/{slug}/payments/verify`                     | `VerifyInput`                                     | `Confirmation`                    | Verifies Razorpay signature and fetches the payment; booking becomes `reserved`. 403 bad signature.                                                                                                                                                                                                                                                                                                                                |
| `POST /api/public/book/{slug}/payments/failed`                     | `FailureInput`                                    | 204                               | Records a failed/abandoned checkout.                                                                                                                                                                                                                                                                                                                                                                                               |
| `POST /api/public/book/{slug}/payments/retry`                      | `FailureInput{orderId}`                           | `Checkout`                        | New order for the same held booking; 409 if already paid. 10/min per IP.                                                                                                                                                                                                                                                                                                                                                           |
| `POST /api/public/book/{slug}/payments/simulate`                   | `SimulateInput`                                   | `{orderId, paymentId, signature}` | Dev only (console gateway); 404 otherwise.                                                                                                                                                                                                                                                                                                                                                                                         |
| `POST /api/public/payments/webhook`                                | raw Razorpay event, header `X-Razorpay-Signature` | 204                               | Server-to-server; 403 bad signature.                                                                                                                                                                                                                                                                                                                                                                                               |

### 8.22 Receipt printing — `PrintController` (`/api/receipts`, class default `STAFF`)

| Method & path                          | Auth                     | Response                                  | Notes                                            |
| -------------------------------------- | ------------------------ | ----------------------------------------- | ------------------------------------------------ |
| `GET /api/receipts/{id}/html?profile=` | `PERM_reservations.view` | `text/html`                               | `profile` ∈ `thermal_58                          | thermal_80 | a4`(default`printer_profile`). `{id}` = receipt id. |
| `GET /api/receipts/{id}/pdf?profile=`  | `PERM_reservations.view` | `application/pdf` (inline, `receipt.pdf`) | Also stores the PDF and sets `receipts.pdf_key`. |

### 8.23 Signed files — `FilesController`

| Method & path                                    | Auth                                 | Response           |
| ------------------------------------------------ | ------------------------------------ | ------------------ |
| `GET /api/files/{key...}?exp=<epoch>&sig=<hmac>` | public (signature is the credential) | image (`image/jpeg | png | webp`) inline, or PDF as attachment; `Cache-Control: no-store`. 403 "Link expired or invalid". Only used with local storage; with S3 the `*-url` endpoints return presigned bucket URLs. Never construct these URLs yourself. |

### 8.24 Guest self-registration — desk side `SelfRegistrationController` (`/api/registrations`, `STAFF`) and guest side `PublicRegistrationController` (`/api/public/registration`)

```
NewLink { id: uuid, url: string ("{appUrl}/g/{token}"), qrDataUri: string (data:image/png;base64,...), expiresAt: datetime }
SelfRegistration { id, state: open|submitted|applied|revoked, expiresAt, submittedAt?, submitted?: Submission, hasIdPhoto: bool }
Submission { name, phone, city, address, nationality, idType, idLast4, passportNo, adults: int, children: int, purpose, members: [{name, adult: bool}], consent: bool, whatsappOptIn: bool }
GuestForm { propertyName, language, askPhoto: bool, askConsent: bool, consentText: string, alreadyDone: bool }
```

| Method & path                                 | Auth   | Request                                                                 | Response                | Notes                                                                                                                      |
| --------------------------------------------- | ------ | ----------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/registrations`                     | STAFF  | `{bookingId?: uuid}` or empty                                           | `NewLink`               | Valid for `self_registration_minutes` (default 30). Show the QR / share the URL. 400 if `self_registration_enabled=false`. |
| `GET /api/registrations/{id}`                 | STAFF  | —                                                                       | `SelfRegistration`      | Poll while the QR is on screen.                                                                                            |
| `POST /api/registrations/{id}/apply`          | STAFF  | `GuestInput?` (desk-corrected copy; empty body keeps the guest's words) | `{"guestId": uuid}`     | Creates/updates the guest record and copies the ID photo. 400 if already applied.                                          |
| `POST /api/registrations/{id}/revoke`         | STAFF  | —                                                                       | `SelfRegistration`      |                                                                                                                            |
| `GET /api/public/registration/{token}`        | public | —                                                                       | `GuestForm`             | 404 for unknown/expired/revoked/used token.                                                                                |
| `POST /api/public/registration/{token}`       | public | `Submission`                                                            | `{"status":"received"}` | Only from `open`.                                                                                                          |
| `POST /api/public/registration/{token}/photo` | public | multipart `file`                                                        | `{"status":"received"}` | Guest's own ID photo.                                                                                                      |

### 8.25 Tax rules — `TaxRuleController` (`/api/tax-rules`, `MANAGER`)

```
TaxRules { slabs: [{uptoPaise: long? (null = catch-all, must be last), bp: int (0..10000)}], note?: string }   default: [{uptoPaise:750000,bp:500},{bp:1800}]
TaxRuleView { id, effectiveFrom: date, rules: TaxRules }
AddInput { effectiveFrom: date!, rules: TaxRules! }
```

| Method & path                       | Auth    | Request    | Response                       |
| ----------------------------------- | ------- | ---------- | ------------------------------ |
| `GET /api/tax-rules`                | MANAGER | —          | `TaxRuleView[]`                |
| `GET /api/tax-rules/in-force?date=` | MANAGER | —          | `TaxRules` (default when none) |
| `POST /api/tax-rules`               | OWNER   | `AddInput` | `TaxRuleView`                  |

---

## 9. Data model

All tenant tables carry `property_id` and are protected by Postgres Row Level Security (`current_property_id()` set per request by `TenantContext`). Platform tables (no `property_id`) are read on a separate admin DB role. Money = `bigint` paise; times = `timestamptz`; ids = `uuid`.

### 9.1 Enums (Postgres types + check constraints)

| Enum                                  | Values                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `user_role`                           | `owner, manager, staff, admin, receptionist, housekeeping, accountant, maintenance`                              |
| `room_status`                         | `clean, dirty, blocked, cleaning, inspected, maintenance`                                                        |
| `booking_state`                       | `reserved, checked_in, checked_out, no_show, cancelled, pending`                                                 |
| `booking_source`                      | `walk_in, phone, other, website, ota, direct, travel_agent, corporate, group`                                    |
| `id_type`                             | `aadhaar, voter, dl, passport, other`                                                                            |
| `folio_status`                        | `open, settled, written_off`                                                                                     |
| `folio_line_kind`                     | `room_charge, day_use, extra, discount, deposit, deposit_refund, forfeit, adjustment`                            |
| `payment_mode`                        | `cash, upi, card, bank, cheque, online`                                                                          |
| `receipt_kind`                        | `invoice, donation, credit_note, provisional, pos_bill`                                                          |
| `outbox_channel`                      | `whatsapp, sms, email, push`                                                                                     |
| `outbox_status`                       | `pending, sent, failed, dead`                                                                                    |
| `billing_status`                      | `trial, active, overdue, readonly, closed`                                                                       |
| `approval_status`                     | `pending, approved, rejected` (table `approvals`, currently unused by the API)                                   |
| rooms.hk_priority                     | `low, normal, high`                                                                                              |
| maintenance_tickets.priority / status | `low, normal, high, urgent` / `open, assigned, in_progress, resolved, closed`                                    |
| lost_found_items.status               | `held, returned, disposed`                                                                                       |
| expenses.category / payment_mode      | `utilities, maintenance, salaries, cleaning, supplies, food, marketing, other` / `cash, upi, card, bank, cheque` |
| inventory_items.category              | `cleaning, linen, toiletries, food, maintenance, stationery`                                                     |
| inventory_movements.kind              | `opening, purchase, consumption, adjustment, to_laundry, from_laundry`                                           |
| pos_orders.status                     | `open, posted, paid, cancelled`                                                                                  |
| payment_orders.status                 | `created, paid, failed, expired`                                                                                 |
| channel_links.channel                 | `airbnb, booking_com, makemytrip, agoda, expedia, other`                                                         |
| guest_registrations.state             | `open, submitted, applied, revoked`                                                                              |
| properties.modules (text[])           | subset of `restaurant, inventory, expenses, maintenance, lost_found, audit`                                      |

### 9.2 Platform tables

- **plans** `code pk, name, max_rooms, monthly_paise, annual_paise, included_messages, active`. Seed: `basic`(20, 49900), `standard`(60, 99900), `large`(100000, 149900).
- **organisations** `id, name, gstin, pan, plan_code→plans, billing_status, billing_due_at, created_at, updated_at`.
- **properties** `id, org_id→organisations, name, address, city, state, phone, email, gstin, trust_reg_no, reg_12a, reg_80g, timezone (default Asia/Kolkata), settings jsonb (registry keys), active, booking_slug unique, code text unique (^[A-Z0-9]{4,12}$, auto-generated e.g. "SHR4821"), modules text[], photo_key, platform_notes`.
- **users** `id, phone unique, email unique, name, password_hash, is_super_admin, active, language (default 'hi'), must_change_password`.
- **sessions** `id, user_id, token_hash unique, device_name, current_property_id, created_at, last_seen_at, expires_at, revoked_at`.
- **otp_codes** `id, target, code_hash, attempts, created_at, expires_at, consumed_at`.
- **property_users** `(property_id, user_id) pk, role user_role, approval_pin_hash, active, created_at`.
- **push_tokens** `id, user_id, token unique, platform (default 'web'), created_at, last_seen_at`.
- **job_runs** `id, name, key, status, detail jsonb, ran_at; unique(name,key)` — idempotency for scheduled jobs.

### 9.3 Tenant tables — rooms & guests

- **room_types** `id, property_id, name, base_rate_paise, max_occupancy (2), extra_person_paise, is_dormitory, bed_count, sort_order, active, amenities text[]`.
- **rooms** `id, property_id, room_type_id, number (unique per property), floor, status room_status, blocked_reason, blocked_until, active, building, housekeeper_id→users, hk_priority, hk_note`.
- **beds** `id, property_id, room_id, label (unique per room), active`.
- **guests** `id, property_id, name, phone, city, address, nationality ('IN'), id_type, id_last4 (never full Aadhaar), id_photo_key, id_photo_purged_at, passport_no, visa_no, visa_expiry, notes, email, state, country, photo_key`.
- **guest_registrations** `id, property_id, booking_id?, token_hash unique, state, submitted jsonb, submitted_at, id_photo_key, applied_guest_id, applied_at, opens, created_by, created_at, expires_at`.
- **devices** `id, property_id, name, offline_block_fy, offline_block_start, offline_block_end` (offline receipt numbering; not exposed via API yet).

### 9.4 Tenant tables — stays & money

- **bookings** `id, property_id, guest_id, state, source, arrive_at, depart_at, checked_in_at, checked_out_at, adults, children, member_count, purpose ('pilgrimage'), notes, consent_at, whatsapp_opt_in, id_photo_skipped_reason, flagged_noshow_at, cancel_reason, client_uuid (unique per property), created_by, created_at, updated_at, special_requests, group_name, organization, billing_gstin, hold_until`. Check `depart_at > arrive_at`.
- **booking_members** `id, property_id, booking_id, name, is_adult, id_type, id_last4, unit_id→booking_units`.
- **booking_units** `id, property_id, booking_id, room_id, bed_id?, rate_paise, arrive_at, depart_at, auto_assigned, cancelled_at`. Exclusion constraint `booking_units_no_overlap` on `coalesce(bed_id, room_id)` × `tstzrange(arrive_at, depart_at)` where not cancelled → 409 "already taken". Trigger also blocks whole-room vs bed overlap in dormitories and rooms of another property.
- **folios** `id, property_id, booking_id unique, status, total_paise, tax_paise, paid_paise, deposit_held_paise, write_off_reason`.
- **folio_lines** `id, property_id, folio_id, kind, description, qty>0, unit_paise (negative for discounts), tax_rate_bp, cgst_paise, sgst_paise, igst_paise, line_date, auto, reason, approved_by, created_by, category`.
- **payments** `id, property_id, folio_id? , pos_order_id?, mode, amount_paise ≠ 0 (negative = refund), reference, is_refund, reason, received_at, received_by, device_id, handover_id→cash_handovers, approved_by, client_uuid (unique per property), gateway_payment_id, refund_of→payments`.
- **cash_handovers** `id, property_id, user_id, amount_paise, counted_by, at, notes`.
- **receipt_counters** `(property_id, fy, kind) pk, last` — gap-free numbering per financial year (Apr–Mar).
- **receipts** `id, property_id, folio_id, kind, number, fy, snapshot jsonb, amount_paise, pdf_key, references_receipt_id, issued_at, issued_by; unique(property_id, fy, kind, number)`.
- **payment_orders** `id, property_id, folio_id, booking_id, gateway, gateway_order_id, amount_paise>0, status, gateway_payment_id, payment_id→payments, failure_reason; unique(gateway, gateway_order_id)`.
- **tax_rules** `id, property_id, effective_from, rules jsonb, created_by`.
- **daily_reports** `id, property_id, business_date, payload jsonb, sent_at; unique(property_id, business_date)`.
- **approvals** (queue mode, unused) `id, property_id, action, payload, requested_by, status, decided_by, decided_at`.

### 9.5 Tenant tables — operations

- **notifications** `id, property_id, kind, title, body, link, permission?, created_at`; **notification_reads** `(property_id, user_id) pk, seen_at`.
- **maintenance_tickets** `id, property_id, room_id?, issue, description, priority, status, assigned_to, resolution, takes_room_off_sale, reported_by, created_at, updated_at, resolved_at`.
- **lost_found_items** `id, property_id, room_id?, description, found_at, found_by, status, returned_to, notes, updated_at`.
- **expenses** `id, property_id, spent_on, category, amount_paise>0, vendor, payment_mode, description, receipt_key, voided_at, void_reason, created_by, created_at`.
- **inventory_items** `id, property_id, name, category, unit, low_stock_threshold numeric(12,2), active`; **inventory_movements** `id, property_id, item_id, kind, qty_change numeric ≠0 (signed), unit_cost_paise, room_id, note, created_by, created_at`.
- **menu_items** `id, property_id, name, category, price_paise≥0, active, sort_order`; **pos_orders** `id, property_id, booking_id?, table_label, status, taxable_paise, tax_rate_bp, cgst_paise, sgst_paise, total_paise, bill_number, folio_line_id, cancel_reason, created_by, created_at, closed_at`; **pos_order_lines** `id, property_id, order_id, menu_item_id?, name, qty>0, unit_paise≥0`.
- **channel_links** `id, property_id, room_id, channel, export_token unique, import_url, last_synced_at, last_error; unique(room_id, channel)`; **channel_stays** `id, property_id, link_id, external_uid, booking_id?, arrive_on, depart_on, summary, conflict, seen_at; unique(link_id, external_uid)`.
- **audit_log** `id, property_id?, user_id?, table_name, row_id, action, before jsonb, after jsonb, at` (append-only).
- **outbox** `id, property_id?, channel, payload jsonb, idempotency_key unique, status, attempts, last_error, send_after, sent_at`.

### 9.6 Settings registry (`SettingsRegistry.ALL`) — key, type, default, minimum role to change

| Group        | Key                                 | Type      | Default                                                                                   | Who         | Options / range              |
| ------------ | ----------------------------------- | --------- | ----------------------------------------------------------------------------------------- | ----------- | ---------------------------- |
| language     | `languages`                         | LIST      | `["hi","en"]`                                                                             | OWNER       | hi, en                       |
| language     | `guest_language`                    | ENUM      | `hi`                                                                                      | MANAGER     | hi, en                       |
| stay         | `checkin_time`                      | TIME      | `12:00`                                                                                   | MANAGER     |                              |
| stay         | `checkout_time`                     | TIME      | `10:00`                                                                                   | MANAGER     |                              |
| stay         | `billing_mode`                      | ENUM      | `night`                                                                                   | OWNER       | night, 24h                   |
| stay         | `late_grace_minutes`                | INT       | 60                                                                                        | MANAGER     | 0..720                       |
| stay         | `late_checkout_policy`              | ENUM      | `half_day`                                                                                | MANAGER     | none, half_day, full_day     |
| stay         | `day_use_allowed`                   | BOOL      | true                                                                                      | MANAGER     |                              |
| stay         | `day_use_rate_pct`                  | INT       | 50                                                                                        | MANAGER     | 0..100                       |
| stay         | `dorm_whole_room_allowed`           | BOOL      | false                                                                                     | OWNER       |                              |
| stay         | `tape_chart_days`                   | INT       | 14                                                                                        | MANAGER     | 7..60                        |
| stay         | `dirty_rooms_assignable`            | BOOL      | true                                                                                      | MANAGER     |                              |
| reservations | `noshow_hour`                       | TIME      | `18:00`                                                                                   | MANAGER     |                              |
| reservations | `noshow_policy`                     | ENUM      | `forfeit`                                                                                 | OWNER       | forfeit, refund, partial     |
| reservations | `noshow_partial_pct`                | INT       | 50                                                                                        | OWNER       | 0..100                       |
| reservations | `tentative_hold_hours`              | INT       | 24                                                                                        | MANAGER     | 1..720                       |
| day          | `business_day_start`                | TIME      | `21:00`                                                                                   | OWNER       |                              |
| day          | `report_channel`                    | ENUM      | `both`                                                                                    | OWNER       | whatsapp, email, both        |
| people       | `approval_mode`                     | ENUM      | `pin`                                                                                     | OWNER       | pin, queue                   |
| people       | `staff_edit_window`                 | ENUM      | `business_day`                                                                            | OWNER       | business_day, hours_24, none |
| people       | `session_days`                      | INT       | 30                                                                                        | OWNER       | 1..365                       |
| guests       | `id_photo_required`                 | BOOL      | true                                                                                      | MANAGER     |                              |
| guests       | `id_photo_max_kb`                   | INT       | 300                                                                                       | OWNER       | 50..2000                     |
| guests       | `id_photo_retention_days`           | INT       | 730                                                                                       | OWNER       | 30..3650                     |
| guests       | `register_requires_all_names`       | BOOL      | true                                                                                      | MANAGER     |                              |
| guests       | `register_template`                 | LIST      | serial,name,address,nationality,id,arrival,departure,unit,adults,children,members,purpose | MANAGER     | + phone                      |
| guests       | `consent_required`                  | BOOL      | true                                                                                      | OWNER       |                              |
| guests       | `self_registration_enabled`         | BOOL      | true                                                                                      | MANAGER     |                              |
| guests       | `self_registration_minutes`         | INT       | 30                                                                                        | MANAGER     | 5..240                       |
| guests       | `self_registration_photo`           | BOOL      | true                                                                                      | MANAGER     |                              |
| guests       | `consent_text`                      | I18N_TEXT | `{en:..., hi:...}`                                                                        | OWNER       |                              |
| tax          | `tax_exempt`                        | BOOL      | false                                                                                     | OWNER       |                              |
| tax          | `religious_precinct`                | BOOL      | false                                                                                     | OWNER       |                              |
| tax          | `exemption_threshold_paise`         | INT       | 100000                                                                                    | OWNER       | 0..100000000                 |
| tax          | `donation_mode`                     | BOOL      | false                                                                                     | OWNER       |                              |
| tax          | `donation_mode_ca_confirmed`        | BOOL      | false                                                                                     | OWNER       |                              |
| tax          | `restaurant_tax_bp`                 | INT       | 500                                                                                       | OWNER       | 0..2800                      |
| tax          | `rates_include_tax`                 | BOOL      | false                                                                                     | OWNER       |                              |
| tax          | `igst_for_interstate_b2b`           | BOOL      | false                                                                                     | OWNER       |                              |
| receipts     | `receipt_prefix`                    | TEXT      | `""`                                                                                      | OWNER       | ≤5                           |
| receipts     | `receipt_number_format`             | TEXT      | `{PREFIX}/{FY}/{SEQ:4}`                                                                   | OWNER       | ≤24                          |
| receipts     | `receipt_header` / `receipt_footer` | TEXT      | `""`                                                                                      | MANAGER     | ≤300                         |
| receipts     | `receipt_terms`                     | TEXT      | `""`                                                                                      | MANAGER     | ≤500                         |
| receipts     | `receipt_logo_key`                  | TEXT      | `""`                                                                                      | MANAGER     | ≤200                         |
| receipts     | `offline_receipt_mode`              | ENUM      | `provisional`                                                                             | OWNER       | provisional, device_block    |
| receipts     | `offline_block_size`                | INT       | 20                                                                                        | OWNER       | 5..200                       |
| receipts     | `offline_cache_days`                | INT       | 7                                                                                         | OWNER       | 1..30                        |
| receipts     | `printer_profile`                   | ENUM      | `thermal_58`                                                                              | MANAGER     | thermal_58, thermal_80, a4   |
| money        | `upi_vpa`                           | TEXT      | `""`                                                                                      | OWNER       | ≤100                         |
| money        | `upi_payee_name`                    | TEXT      | `""`                                                                                      | OWNER       | ≤100                         |
| money        | `payment_modes`                     | LIST      | cash,upi,card,bank,cheque                                                                 | MANAGER     | same                         |
| money        | `deposit_default_paise`             | INT       | 0                                                                                         | MANAGER     | 0..10000000                  |
| messaging    | `whatsapp_enabled`                  | BOOL      | true                                                                                      | OWNER       |                              |
| messaging    | `whatsapp_guest_updates`            | BOOL      | false                                                                                     | OWNER       |                              |
| messaging    | `push_enabled`                      | BOOL      | true                                                                                      | OWNER       |                              |
| messaging    | `checkout_reminder_minutes`         | INT       | 60                                                                                        | MANAGER     | 0..720 (0 = off)             |
| online       | `online_booking_enabled`            | BOOL      | false                                                                                     | OWNER       |                              |
| online       | `online_booking_max_nights`         | INT       | 7                                                                                         | MANAGER     | 1..30                        |
| online       | `online_booking_days_ahead`         | INT       | 180                                                                                       | MANAGER     | 7..365                       |
| online       | `online_payment`                    | ENUM      | `off`                                                                                     | OWNER       | off, optional, required      |
| online       | `online_payment_advance_pct`        | INT       | 100                                                                                       | OWNER       | 10..100                      |
| online       | `online_payment_hold_minutes`       | INT       | 30                                                                                        | OWNER       | 10..240                      |
| platform     | `support_access_until`              | TEXT      | `""`                                                                                      | OWNER       | ISO timestamp                |
| platform     | `org_data_retention_days`           | INT       | 90                                                                                        | SUPER_ADMIN | 30..3650                     |
| platform     | `grace_banner_days`                 | INT       | 15                                                                                        | SUPER_ADMIN | 0..365                       |
| platform     | `grace_readonly_days`               | INT       | 45                                                                                        | SUPER_ADMIN | 0..365                       |

---

## 10. Background jobs & integrations

All jobs run per active property inside its tenant context and record `job_runs(name, key)` so restarts/multiple instances never repeat work. Disabled with `pms.jobs.enabled=false`.

| Job              | Schedule                              | What it does (mobile-relevant effects)                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OutboxWorker`   | every 5 s (`pms.jobs.outbox-poll-ms`) | Sends pending `outbox` rows (whatsapp/sms/email/push) with retries; `dead` rows alert the ops email. **Push tokens rejected by FCM (`UNREGISTERED`/`INVALID_ARGUMENT`) are deleted** — re-register on next app start.                                                                                                                                                                                                                  |
| `FrontDeskJob`   | every 5 min (`:15`)                   | `payments.reconcileWaiting()` (asks gateway about `created`/`failed` orders older than 5 min or past hold); `bookings.expireHolds()` (pending bookings past `hold_until` → `cancelled`, reason "Hold expired", notification `booking_cancelled`); checkout reminders `checkout_reminder_minutes` before `depart_at` (notification `checkout_reminder` to `checkout` holders, WhatsApp to opted-in guests if `whatsapp_guest_updates`). |
| `NoShowJob`      | every 15 min                          | After `noshow_hour` local time, sets `flagged_noshow_at` on `reserved` bookings that should have arrived today (they appear in `today.flaggedNoShow`). The desk then calls `/no-show` or `/arrive`.                                                                                                                                                                                                                                    |
| `DailyReportJob` | every 15 min                          | After `business_day_start`, once per property per business date: computes `/reports/daily`, stores `daily_reports`, queues WhatsApp template `daily_summary_owner` and/or email to owners/admins/managers per `report_channel`.                                                                                                                                                                                                        |
| `ChannelSyncJob` | every 15 min (`:07:30`)               | Pulls each `channel_links.import_url` iCal, creates/moves/cancels `source='ota'` bookings; unresolvable overlaps become `channel_stays.conflict` (surfaced as `today.channelConflicts` and `/api/channels` `conflicts`).                                                                                                                                                                                                               |
| `PhotoPurgeJob`  | daily 03:30 / 03:45                   | Deletes guest ID photos and self-registration photos older than `id_photo_retention_days` after checkout; purges old OTP codes and dead sessions.                                                                                                                                                                                                                                                                                      |

### 10.1 Push notifications (FCM) — payload and registration

- Provider chosen by `PMS_PUSH_PROVIDER`: `fcm` (`FcmPushProvider`, Firebase Admin SDK, service-account JSON inline or `file:/path`) or `console`.
- **Registration**: after login (and whenever FCM rotates the token) call `POST /api/notifications/push-token {"token": "<fcm token>", "platform": "android"|"ios"}`. Tokens are per user; the server fans out by property membership and role at send time. Logging out does not delete the token (consider re-registering under the new user; upsert reassigns `user_id`).
- **When a push is sent**: `Notifier.notify(kind, title, body, link, permission)` inserts a `notifications` row and, if the property's `push_enabled` is not false, enqueues one outbox `push` row per token of every active member whose role holds `permission` (all roles when null). Idempotency key `notify:<notificationId>:<tokenHash>`.
- **FCM message shape** actually sent (`FcmPushProvider.send`):
  ```
  Message{ token: <device token>, notification: { title: <title>, body: <body> }, data: {} }
  ```
  i.e. a plain **notification message** with `title`/`body` and an **empty `data` map** — no `kind`, `link` or ids travel in the push today. On tap, the app should open the notification feed (`GET /api/notifications`) and use `Item.link` (e.g. `/stays/{bookingId}`) for deep-linking. (`PushProvider.send(token, title, body, data)` supports a data map; `OutboxSender` passes `Map.of()`.)
- Title/body examples by kind: `check_in` "Checked in: {guest}" / "{units}"; `room_dirty` "Checked out: {units} to clean" or "Room {n} needs cleaning"; `room_ready` "Room {n} is ready"; `new_booking` "New booking: {guest} (pending)"; `booking_cancelled` "Cancelled: {guest}" or "Hold expired: {guest}"; `checkout_reminder` "Checkout at HH:mm: {guest}" / "{units} · due ₹…"; `payment_received` "Payment ₹… (mode)" / "{guest}"; `payment_failed` "Online payment failed: {guest}"; `payment_short` "Part payment online: {guest}"; `payment_after_expiry` "Paid after the booking lapsed: {guest}"; `maintenance` "Room {n}: {issue}" / "{priority}"; `low_stock` "Low stock: {item}" / "{qty} {unit} left".
- Audience by kind: `check_in`, `room_dirty` → `housekeeping`; `room_ready`, `new_booking`, `booking_cancelled` → `checkin`; `checkout_reminder` → `checkout`; `payment_*` → `revenue.view`; `maintenance` → `maintenance`; `low_stock` → `inventory`.

### 10.2 Guest messaging (WhatsApp / SMS / email)

- Outbox channels: `whatsapp` (Meta Cloud API templates or console), `sms` (MSG91 for OTP only), `email` (Brevo). Payloads: whatsapp `{to, template, language, params[], documentKey?, documentFilename?}`; sms `{to, text}`; email `{to, subject, html}`; push `{token, title, body}`.
- WhatsApp templates (`MessageTemplates`): `booking_confirmed` (on reserve/confirm), `checkin_receipt`, `checkout_receipt` (invoice PDF attached), `daily_summary_owner`, and, only when `whatsapp_guest_updates` is on and the guest opted in: `booking_cancelled`, `payment_received`, `checkout_reminder`. Phone numbers are sent E.164 with `91` prefix.

### 10.3 Payments gateway

`PMS_PAYMENTS_PROVIDER`: `razorpay` | `console` (dev simulator) | `none` (disabled; `/api/payments/online` reports `enabled:false`, booking page `payment:"off"`). Flow: `Checkout` (provider, keyId, orderId, amountPaise, currency INR, name, holdUntil) → client opens Razorpay checkout → `verify` with `{orderId, paymentId, signature}` → server verifies HMAC and fetches the payment → records a `payments` row with `mode='online'` and confirms the booking. Webhook `POST /api/public/payments/webhook` and the 5-minute reconcile job cover the case where the client never reports back. Refunds of online money go back through the gateway (`FolioController.refund` with `mode:"online"`).

### 10.4 Storage & PDFs

`PMS_STORAGE_PROVIDER`: `local` (files served via `/api/files/**` with HMAC-signed, 5-minute links) or `s3` (R2/MinIO/S3 presigned URLs). PDF receipts rendered with OpenHTMLtoPDF (`PMS_PDF_PROVIDER=openhtml`, or `noop`). Always fetch a fresh URL from the `*-url` endpoints right before displaying; never cache the signed URL.

### 10.5 Dev conveniences

Dev profile seeds a property (`DevSeeder`): owner `owner@pms.local` / `password123`, approval PIN `1234`; `PMS_DEV_OTP` fixes every OTP to a known value. Console providers print messages to the server log instead of sending.
