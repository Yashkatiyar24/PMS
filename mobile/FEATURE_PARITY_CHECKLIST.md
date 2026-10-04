# Feature parity checklist

Every web feature from `FEATURE_INVENTORY.md` §4, ticked when the mobile app does it. Legend: ✅ done · ◐ done
differently on a phone (noted) · ❌ deferred (noted). Web-only pages meant for strangers are listed at the end.

## Auth & shell

- [x] Sign in with property code + email + password (`LoginScreen`)
- [x] Platform admin sign-in with email only (empty code)
- [x] OTP sign-in by phone/email (send → verify)
- [x] Remember last property code
- [x] Session from `Set-Cookie`, stored encrypted; `/me` on launch and foreground; 401 → login
- [x] Switch property (user menu, portfolio, billing-closed screen) — clears caches, reloads `/me`
- [x] Log out (revokes session), list and revoke own devices (`SessionsScreen`, mobile-only addition)
- [x] Change password; forced change when `mustChangePassword` (`ForcePasswordChangeScreen`)
- [x] Billing gate: `closed` screen, `overdue`/`readonly` banners
- [x] Language hi/en (default hi), text size, appearance light/dark/system — persisted per device
- [x] Global booking search (name / phone ≥4 digits / reference)
- [x] Header: property name, search, unread badge, avatar menu
- [x] Tabs and landing tab follow the role exactly as `BottomNav.tsx` (`utils/permissions.visibleTabs`)

## Today

- [x] Occupancy ring, available / booked / out of service, free by type
- [x] Seven activity tiles filtering the list; "show completed" for arrivals; "everyone arrived" empty state
- [x] No-show flagged banner → list
- [x] Double bookings tile → Channels
- [x] Stay rows (units, dates, nights, state, balance) → stay
- [x] Forecast card with 14-day pager and nightly bars (`revenue.view`)
- [x] Check-in / New booking actions; 30 s refresh; pull to refresh; reload after offline sync

## Bookings

- [x] Tape chart: units grouped by type, N days from `tape_chart_days`, per-day % and free, bars by state, OTA/website icons, blocked bands
- [◐] Move a stay — web drags; mobile long-presses a bar → Move sheet (same `POST /{id}/move`)
- [x] Tap empty cell: today → check-in prefilled; future → new booking prefilled
- [x] Pager earlier/today/later and date jump
- [x] New booking: guest lookup, dates, room type or particular units, group multi-select, adults/children, source + group/company/GSTIN, city, requests, tentative hold, WhatsApp, advance + mode, consent; availability re-queried on date change; validation order as web
- [x] Walk-in check-in: lookup/new guest, ID type/last 4/address/city, ID photo (camera/gallery, compressed to `id_photo_max_kb`), skip reason, adults/children/nights, room type → free unit (dirty dot), advance/deposit/mode, consent, WhatsApp; "To collect" total; validation order; queued offline; "Took Ns"
- [x] Self-registration QR: create link, show QR, poll 2 s, apply submission into the form, new code, expiry
- [◐] On-device ID OCR — web uses tesseract.js; mobile uses ML Kit (Android) / Apple Vision (iOS) through `utils/ocr.ts`, same `extractId` rule, fills only an empty last-4 and sets Aadhaar, then shows `ocr.filled`
- [x] Stay: reference, state/payment chips, phone link, facts strip
- [x] State actions: Confirm (pending), Mark arrived, Take payment, Check out (unpaid/early → override sheet with reason + PIN), Invoice
- [x] Overflow: Add extra, Give discount, Refund, Invoice, Edit details, Party, Add room, Mark no-show, Cancel
- [x] Tabs: Accommodation (change room, give back), Bill (lines, GST, totals, payments, provisional receipt), Guest details (→ profile), Receipts (print, credit note), Activity
- [x] Approval PIN pattern on discount / refund / credit note / cancel / no-show / checkout override / release
- [x] Receipts open in an in-app viewer with the session cookie; PDF share

## Folio, payments, receipts

- [x] Take payment (modes from `payment_modes`, queued offline, idempotent)
- [x] Add extra (categories), discount (negative line + reason), refund (≤ paid, mode, reason), credit note against an invoice
- [x] Invoice / donation receipt, provisional receipt for a payment
- [x] Remove a bill line: ✕ on added charges (room charges follow the dates), reason + approval PIN (`discount.apply`) → `DELETE /lines/{id}`; added to the web stay page too

## Guests

- [x] In-house list (people, nights left, balance, leaving today, arrived at) and register search
- [x] Profile: stays/nights/paid/unpaid tiles, current stay, details, all stays, payments
- [x] Edit guest (all fields incl. nationality, passport, visa)
- [x] View photo / ID document via signed URL; take photo

## Rooms & housekeeping

- [x] Grid by building/floor with status bar, type, occupancy, housekeeper, high-priority flag; counts subtitle
- [x] Filters All / Mine / Clean / Needs cleaning / Out of order
- [x] Room sheet: status transitions (optimistic + revert), block / maintenance with reason, occupancy rows → stay, report a problem, housekeeping assignment (cleaner, priority, note)
- [x] Overflow → Maintenance, Lost & found

## Reports

- [x] Daily: collection by mode, occupancy, arrivals/no-shows, departures, unpaid bills (→ stay), cash in hand + hand over (manager), deposits held
- [x] Menu: period report, send now (manager), guest register CSV (7 days), month CSV — shared via the OS share sheet
- [x] Period: presets + custom dates; tiles; revenue, bookings, sources, payments, online orders (+ Check), expenses, GST, housekeeping, maintenance, guests; CSV
- [◐] Charts — recharts on web; plain-view bars on mobile

## Notifications

- [x] Feed with kind icons, mark seen on open, unread count polled every 60 s
- [x] Push: permission, FCM token → `/push-token` (re-sent on refresh and property switch), foreground toast, background/killed tap → deep link (mobile-only; backend now sends `data.link`)

## Settings

- [x] Hub: operations (permission-gated), property setup (manager+), rules groups with changed-count, more, log out; search
- [x] Registry-driven editor: BOOL / INT (₹ and unit suffixes, range) / TIME / ENUM / LIST (ordered) / TEXT / I18N_TEXT; Edited/Changed chips; lock line by `who`; reset to default; draft → one PATCH; unsaved-changes guard
- [x] Property details + GSTIN disclosure; photo add/change/remove
- [x] Room types (add/edit, dormitory + beds), rooms (bulk range, edit, in-use, beds add/toggle)
- [x] Tax rules: in-force card, history, owner adds slabs
- [x] Staff: property code card, members with role chips and PIN flag; invite → one-time credentials; role; reset password; set PIN; remove access; owner-only grants
- [x] Channels: booking page (create / copy / open / on-off), conflicts, OTA links (add, export URL, sync, change URL, rotate, unlink)

## Operations modules (shown only with the module + permission)

- [x] Restaurant: orders open/all, new order (counter/table or in-house guest, menu + ad hoc lines, quantities), settle (charge to room / pay / cancel), bill viewer; menu add/edit (manager+)
- [x] Inventory: items by category, All/Low, add/edit item, movements (purchase, consumption+room, laundry, adjustment, opening), history
- [x] Expenses: month pager, totals by category, add with bill photo, void with reason, view bill
- [x] Maintenance: open/all, ticket sheet (status, assignee, priority, resolution), report flow (pick room → report), also from Rooms
- [x] Lost & found: add, status held/returned/disposed with returned-to
- [x] Audit: date range, table, search; before/after JSON

## Portfolio & platform

- [x] Portfolio cards with totals; open switches property
- [x] Platform list: tiles, filters (all/trial/active/attention/quiet), search, CSV export, onboard property → credentials
- [x] Platform property: tiles, details, plan, billing, on/off, modules, team + reset password, notes, recent changes
- [x] Platform property photo upload/remove (`PropertyPhotoCard`, shared with Property details; compressed to 600 KB / 1600 px)

## Cross-cutting

- [x] Permission gating: tabs, menus, and `gated()` on every shared screen (deep links included)
- [x] Offline writes: check-in and folio payments queued, replayed on reconnect / 30 s; failures → Needs attention
- [x] Offline reads: every list cached in MMKV with "Updated N ago"; cleared on logout / property switch
- [x] Loading / empty / error state on every data screen; every API call returns a typed result; one toast helper; one ErrorBoundary
- [x] Money as paise via `rupees()` / `toPaise()`; dates dd-mm-yyyy; local day keys

## Web-only by decision (see FEATURE_INVENTORY §0)

- `/g/[token]` guest self-registration form — the app shows the QR; guests use their own browser
- `/book/[slug]` public booking page — the app shows/copies/opens the URL
- Marketing landing on `/login`

## Verified in this repository

- `npm run typecheck`, `npm run lint` (0 warnings) and `npm test` (utils incl. OCR, stores, queue, linking, form
  builders) pass; `npx expo export --platform android` bundles.
- Runtime: `npm run smoke:web` drives the app (react-native-web in Chromium) against the real API on the seeded dev
  database — 37/37 steps across owner, staff (PIN) and platform admin, repeatable on the same database. Bugs it
  found and that are fixed: occupied rooms labelled "Reserved" (the API sends `occupied`), empty strings rendered
  outside `<Text>` (a crash on a phone; now caught by `react/jsx-no-leaked-render`), menus that navigate while
  their sheet is still closing, and a compile error in the backend push payload.
- Backend `mvn test`: 146 tests pass (including the push-payload fix).
- The web stay page's remove-charge sheet was checked the same way (staff: disabled until the PIN, then
  `200 DELETE`), and the web's own `npm run ui-check` passes.
- Not run here: native Android/iOS builds, the Maestro flows (`.maestro/flows`, incl. `remove-charge.yaml`), push
  delivery and ML Kit OCR. This container has no emulator support (no KVM) and its network policy blocks
  `dl.google.com`, where the Android SDK comes from.
