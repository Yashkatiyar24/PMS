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
| `PMS_STORAGE_PROVIDER` | `local` or `s3` (S3, Cloudflare R2, MinIO) |
| `PMS_SMS_PROVIDER` | `console` or `msg91` |
| `PMS_EMAIL_PROVIDER` | `console` or `brevo` |
| `PMS_WHATSAPP_PROVIDER` | `console` or `meta` |
| `PMS_PUSH_PROVIDER` | `console` or `fcm` |

Swapping a provider is one variable. Adding one is a class and a line in `IntegrationsConfig`.

Every default above is chosen to make a fresh clone run, which also makes it unsafe to deploy. So the
server refuses to start outside the `dev` and `test` profiles while any of them are still in place — the
shipped session secret, a fixed login code, the demo seeder, a cookie that would travel over plain HTTP,
or an origin list still pointing at localhost. It names all of them at once rather than one restart at a
time, and it runs before the port is bound, so a misconfigured server never answers a request.

## Tests

```bash
cd backend && mvn test                  # 61 tests, needs Postgres on localhost:5432
cd frontend && npm test && npm run lint && npm run build
python3 infra/smoke.py                  # a whole desk day against a running server
cd frontend && npm run ui-check         # the same day in a real browser at phone size
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
| `/check-in` | the 60-second walk-in flow |
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
| `/needs-attention` | offline entries the server refused |

## Not built yet

PDF export of the police register (the CSV export exists), guest self-booking, and payment links. These are
v2 in the PRD.
