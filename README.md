# Dharamshala PMS

A multi-tenant property management system for dharamshalas and small hotels in India. Version 1 replaces the
paper guest register, the receipt book and the month-end ledger, on a phone, over a bad network, in Hindi.

The requirements are in [`docs/PRD.md`](docs/PRD.md); the build steps that shaped this repository are in
[`docs/BUILD_PROMPTS.md`](docs/BUILD_PROMPTS.md).

## What is here

```
backend/    Spring Boot 3.5 on Java 21 (virtual threads), Postgres, Flyway
frontend/   Next.js 16 App Router, TypeScript, Tailwind, installable PWA
docs/       PRD and build prompts
infra/      docker-compose for local Postgres
```

## Running it

You need Java 21, Node 22 and Postgres 16.

```bash
# 1. database
docker compose -f infra/docker-compose.yml up -d        # or use your own Postgres

# 2. backend (applies migrations and seeds a pilot property on the dev profile)
cd backend && mvn spring-boot:run -Dspring-boot.run.profiles=dev

# 3. frontend
cd frontend && npm install && npm run dev
```

Then open http://localhost:3000 and sign in as `owner@pms.local` / `password123`, or by phone `9000000001`
with the code `123456` (the dev profile prints OTPs instead of sending them).

The seed creates one trust, one property in Haridwar, twenty rooms, two ten-bed dormitories, and three
users: an owner, a manager and a staff member. The approval PIN is `1234`.

## How it is put together

**One database, many properties.** Every tenant table carries `property_id` and has Row Level Security. The
API connects as `pms_app`, a role that cannot bypass RLS, and every transaction begins by setting the tenant
for the request. A transaction that starts without one is refused rather than silently seeing nothing. Auth,
sessions and scheduled jobs use a second role, `pms_admin`, and only through their own transaction manager.

**The database decides availability.** Rooms are claimed by inserting a `booking_units` row; an exclusion
constraint over the unit and the stay's time range is what prevents a double booking. Two desks racing for
the last bed cannot both win, however the application is deployed.

A whole dormitory room and one of its beds are the same place under two names, which the constraint cannot
see; a trigger on `booking_units` locks the room row and refuses the second of the two, and also refuses a unit
whose room belongs to another property or whose bed belongs to another room.

**A payment the browser reports is only a claim.** A booking paid online stays pending, holding its room, until
the server has checked the gateway's signature with a secret the browser never sees and asked the gateway itself
for the payment. The browser, the webhook and reconciliation may all report the same payment; it is recorded once.

**Rules that differ between properties are settings, not code.** They live in one registry
(`SettingsRegistry`) with a default, a type and the role allowed to change them, and the settings screen is
generated from it. Tax slabs are effective-dated rows, so a rate change is data entry, not a release.

**Money is integer paise, never a float.** Receipts store an immutable snapshot at issue time, numbered
gap-free per property, financial year and kind under a row lock. Corrections are credit notes; nothing
issued is ever edited.

**Nothing external can block the desk.** WhatsApp, SMS, email and push messages are rows in an outbox that a
worker drains with backoff. Storage, messaging and PDF rendering all sit behind small interfaces chosen by
configuration, with a console or local implementation for development.

**The phone keeps working without a network.** Writes carry a client-generated id that the API treats as an
idempotency key, so a queued check-in replayed later creates one booking. Anything the server refuses lands
in a "needs attention" list instead of disappearing.

**Every change is auditable.** Writes to bookings, folios, payments, rooms and settings leave a row in
`audit_log`, which has no UPDATE or DELETE grant for either application role.

**The guest can fill their own register entry.** The desk shows a QR code, the guest scans it with their own
phone and types their own name, address and ID — the things that used to be written into a paper register
while a queue formed. It is the one door in the system that opens without a login, so it is built for the
caller to be a stranger: the link is 256 random bits stored only as a SHA-256 hash, it expires and works
once, reading it discloses nothing about any guest, booking or bill, and submitting it writes inert JSON
that changes no guest, booking or folio. The desk, signed in, is what turns a submission into a record.

## Configuration

Everything is an environment variable with a working default; see
[`backend/src/main/resources/application.yml`](backend/src/main/resources/application.yml). The ones that
matter in production:

| Variable | What it does |
| --- | --- |
| `PMS_DB_APP_URL`, `PMS_DB_APP_PASSWORD` | the RLS-enforced connection the API uses |
| `PMS_DB_ADMIN_URL`, `PMS_DB_ADMIN_PASSWORD` | the RLS-bypassing connection for auth and jobs |
| `PMS_SESSION_SECRET` | signs file links; must be set to something random |
| `PMS_COOKIE_SECURE` | `true` once you are behind HTTPS |
| `PMS_ALLOWED_ORIGINS` | the origins the desk app is served from; the browser is refused from anywhere else |
| `PMS_APP_URL` | where the desk app lives; self-registration QR codes point at it |
| `PMS_STORAGE_PROVIDER` | `local` or `s3` (S3, Cloudflare R2, MinIO) |
| `PMS_SMS_PROVIDER` | `console` or `msg91` |
| `PMS_EMAIL_PROVIDER` | `console` or `brevo` |
| `PMS_WHATSAPP_PROVIDER` | `console` or `meta` |
| `PMS_PUSH_PROVIDER` | `console` or `fcm` |
| `PMS_PAYMENT_PROVIDER` | `none` (default), `razorpay`, or `console` (a simulator; development only) |
| `PMS_RAZORPAY_KEY_ID`, `PMS_RAZORPAY_KEY_SECRET`, `PMS_RAZORPAY_WEBHOOK_SECRET` | Razorpay API keys, and the secret its webhook to `/api/public/payments/webhook` is signed with |

Swapping a provider is one variable. Adding one is a class and a line in `IntegrationsConfig`.

### Deploying the desk app on Vercel

Vercel runs the Next.js app only. The Spring Boot API and Postgres need a host that keeps a Java server running
(Render, Railway, Fly.io, a VM), because the API holds sessions, runs scheduled jobs and keeps its own database
connections.

1. Import the repository in Vercel and set **Root Directory** to `frontend`; it detects Next.js by itself.
2. Set `PMS_API_ORIGIN` to the API's address, e.g. `https://api.example.in`. Do not set `NEXT_PUBLIC_API_BASE`.
   The browser then calls `/api/...` on the Vercel domain and Vercel passes it to the API, so the session cookie
   is the app's own and no cross-site cookie is involved.
3. On the API, set `PMS_APP_URL` and `PMS_ALLOWED_ORIGINS` to the Vercel address (e.g.
   `https://pms.vercel.app`) and `PMS_COOKIE_SECURE=true`. If signing in on a preview deployment fails with
   "forbidden", add that preview's address to `PMS_ALLOWED_ORIGINS` as well.

Every default above is chosen to make a fresh clone run, which also makes it unsafe to deploy. So the
server refuses to start outside the `dev` and `test` profiles while any of them are still in place — the
shipped session secret, a fixed login code, the demo seeder, a cookie that would travel over plain HTTP,
an origin list still pointing at localhost, the payment simulator, or Razorpay without its secrets. It names all of them at once rather than one restart at a
time, and it runs before the port is bound, so a misconfigured server never answers a request.

## Tests

```bash
cd backend && mvn test                  # 132 tests, needs Postgres on localhost:5432
cd frontend && npm test && npm run lint && npm run build
python3 infra/smoke.py                  # a whole desk day against a running server
cd frontend && npm run ui-check         # the same day in a real browser at phone size
cd frontend && npm run feature-check    # the later screens (operations, reports, groups) at phone size
cd frontend && npm run selfreg-check    # the QR handover, driven on two separate phones
```

The backend tests are integration tests against a real Postgres, because the guarantees worth testing are
the database's: that one tenant cannot see another's rows, that two concurrent check-ins for the last bed
produce exactly one stay, that receipt numbers have no gaps under load, and that the audit log cannot be
rewritten.

`npm run ui-check` drives Chromium at 360x740 against a running dev server: sign in, switch language, read
the day, open the check-in form, the tape chart, the settings and the reports, and fail if any control is
under 44px or anything unexpected reaches the console. It exists because the other two suites talk to the
API directly and so cannot notice when the browser is the thing being refused — a missing CORS header once
left every test green while nobody could sign in at all.

`npm run selfreg-check` drives the QR handover across two browser contexts, because one context would
carry the desk's session onto the guest's page and prove nothing. It reads the QR off the desk's screen with
a real decoder rather than reusing a link it already knew, then fills the form as the guest and watches the
details land back on the desk.

`infra/smoke.py` runs the real thing over HTTP after a deploy: sign in, check a guest in, fail to sell the
same room twice, refuse an Aadhaar number, take payment, check out, print the receipt as HTML and PDF, and
read the reports. It leaves one test stay behind, so run it against staging or a closed desk.

One behaviour worth knowing: an open folio is re-priced from the current rules whenever the stay changes, so
registering for GST mid-stay taxes the nights that have not been invoiced yet. Once the invoice is issued its
snapshot is frozen and never recomputed.

## Screens

| Route | What it is for |
| --- | --- |
| `/` | today: arrivals, in-house, departures, what is free, and the check-in button |
| `/check-in` | the 60-second walk-in flow, including the QR handover to the guest's own phone |
| `/stays/[id]` | one stay: bill, payments, checkout, receipts, cancel and no-show |
| `/bookings` | tape chart, rooms down and days across |
| `/bookings/new` | advance booking taken over the phone |
| `/rooms` | housekeeping: clean, dirty, blocked |
| `/reports` | collections, cash in hand, unpaid bills, register and month exports |
| `/settings` | every rule from the registry, plus the setup screens below |
| `/settings/property` | name, address, GSTIN, trust registration |
| `/settings/rooms` | room types with rates, and rooms added as a range |
| `/settings/tax` | GST slabs, effective-dated |
| `/settings/staff` | invite, change role, set approval PIN, remove access |
| `/admin` | our back office: onboard a property, see health, set billing |
| `/guests`, `/guests/[id]` | guest search, and one guest's stays, payments, balance, photo and ID |
| `/maintenance` | repair tickets: report, assign, resolve; a ticket can take its room off sale |
| `/lost-found` | things guests left behind, and who they were returned to |
| `/expenses` | money out by month and category, with a photo of each bill |
| `/inventory` | supplies and linen: stock in, used, to the laundry and back, low-stock warnings |
| `/restaurant` | menu and orders; an order is posted to a guest's bill or paid at the counter |
| `/reports/period` | every report over any dates: occupancy, ADR, RevPAR, revenue, GST, sources, expenses, housekeeping, maintenance |
| `/notifications` | what happened lately that the user's role cares about |
| `/portfolio` | an owner's properties side by side, and switching between them |
| `/audit` | who changed what, from what to what |
| `/needs-attention` | offline entries the server refused |
| `/g/[token]` | **no login:** the guest's own self-registration form, opened by scanning the desk's QR |

## Roles

`owner`, `admin`, `manager`, `receptionist` (the old `staff`), `housekeeping`, `accountant` and `maintenance`.
What each may do is one table in `in.pms.auth.Permissions`. The desk roles keep exactly the access they always
had; the three narrow roles rank below the desk and reach only the endpoints that name their permission. An
exception (a discount, refund, cancellation or credit note) needs the matching permission, or the approval PIN of
someone who holds it.

## Not built yet

PDF export of the police register (the CSV export exists), payment links sent from the desk, and pushing
notifications to browsers (the server sends FCM pushes to registered tokens, but the web app does not register
one yet; the in-app feed is what staff see).

Self-registration links can be tied to an existing booking, and `POST /api/registrations/{id}/apply` turns
such a submission straight into a guest record — useful for an advance booking whose guest fills their
details before arriving. The walk-in screen deliberately does not use it: there the submission fills the
desk's own form instead, so a human reads it back before anything is saved. Only the walk-in path has a
screen today.
