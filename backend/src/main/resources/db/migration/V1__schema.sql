-- Dharamshala PMS schema (PRD section 7).
-- One schema shared by every property. Every tenant table carries property_id and is
-- protected by Row Level Security (see V2). Money is BIGINT paise. All times are TIMESTAMPTZ.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE user_role       AS ENUM ('owner', 'manager', 'staff');
CREATE TYPE room_status     AS ENUM ('clean', 'dirty', 'blocked');
CREATE TYPE booking_state   AS ENUM ('reserved', 'checked_in', 'checked_out', 'no_show', 'cancelled');
CREATE TYPE booking_source  AS ENUM ('walk_in', 'phone', 'other');
CREATE TYPE id_type         AS ENUM ('aadhaar', 'voter', 'dl', 'passport', 'other');
CREATE TYPE folio_status    AS ENUM ('open', 'settled', 'written_off');
CREATE TYPE folio_line_kind AS ENUM ('room_charge', 'day_use', 'extra', 'discount', 'deposit', 'deposit_refund', 'forfeit', 'adjustment');
CREATE TYPE payment_mode    AS ENUM ('cash', 'upi', 'card', 'bank', 'cheque');
CREATE TYPE receipt_kind    AS ENUM ('invoice', 'donation', 'credit_note', 'provisional');
CREATE TYPE outbox_channel  AS ENUM ('whatsapp', 'sms', 'email', 'push');
CREATE TYPE outbox_status   AS ENUM ('pending', 'sent', 'failed', 'dead');
CREATE TYPE billing_status  AS ENUM ('trial', 'active', 'overdue', 'readonly', 'closed');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');

-- ============================================================
-- Platform level (no tenant scoping)
-- ============================================================

CREATE TABLE plans (
  code              text PRIMARY KEY,
  name              text NOT NULL,
  max_rooms         integer NOT NULL,
  monthly_paise     bigint NOT NULL DEFAULT 0,
  annual_paise      bigint NOT NULL DEFAULT 0,
  included_messages integer NOT NULL DEFAULT 300,
  active            boolean NOT NULL DEFAULT true
);

CREATE TABLE organisations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  gstin          text,
  pan            text,
  plan_code      text REFERENCES plans(code),
  billing_status billing_status NOT NULL DEFAULT 'trial',
  billing_due_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE properties (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organisations(id),
  name         text NOT NULL,
  address      text NOT NULL DEFAULT '',
  city         text NOT NULL DEFAULT '',
  state        text NOT NULL DEFAULT '',
  phone        text NOT NULL DEFAULT '',
  email        text,
  gstin        text,
  trust_reg_no text,
  reg_12a      text,
  reg_80g      text,
  timezone     text NOT NULL DEFAULT 'Asia/Kolkata',
  settings     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- keys from the settings registry
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone          text UNIQUE,
  email          text UNIQUE,
  name           text NOT NULL,
  password_hash  text,
  is_super_admin boolean NOT NULL DEFAULT false,
  active         boolean NOT NULL DEFAULT true,
  language       text NOT NULL DEFAULT 'hi',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id),
  token_hash          text NOT NULL UNIQUE,      -- sha256 of the cookie token
  device_name         text NOT NULL DEFAULT '',
  current_property_id uuid REFERENCES properties(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  revoked_at          timestamptz
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE otp_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target      text NOT NULL,                     -- phone or email
  code_hash   text NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX otp_target_idx ON otp_codes(target, created_at);

CREATE TABLE property_users (
  property_id       uuid NOT NULL REFERENCES properties(id),
  user_id           uuid NOT NULL REFERENCES users(id),
  role              user_role NOT NULL,
  approval_pin_hash text,
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, user_id)
);

CREATE TABLE push_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id),
  token        text NOT NULL UNIQUE,
  platform     text NOT NULL DEFAULT 'web',
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE job_runs (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name   text NOT NULL,
  key    text NOT NULL,                          -- e.g. daily_report:<property>:<date>
  status text NOT NULL DEFAULT 'done',
  detail jsonb,
  ran_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, key)
);

-- ============================================================
-- Tenant tables (property_id on every row; RLS in V2)
-- ============================================================

CREATE TABLE devices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         uuid NOT NULL REFERENCES properties(id),
  name                text NOT NULL,
  offline_block_fy    text,
  offline_block_start integer,
  offline_block_end   integer,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE room_types (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id        uuid NOT NULL REFERENCES properties(id),
  name               text NOT NULL,
  base_rate_paise    bigint NOT NULL DEFAULT 0,
  max_occupancy      integer NOT NULL DEFAULT 2,
  extra_person_paise bigint NOT NULL DEFAULT 0,
  is_dormitory       boolean NOT NULL DEFAULT false,
  bed_count          integer NOT NULL DEFAULT 0,
  sort_order         integer NOT NULL DEFAULT 0,
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rooms (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    uuid NOT NULL REFERENCES properties(id),
  room_type_id   uuid NOT NULL REFERENCES room_types(id),
  number         text NOT NULL,
  floor          integer NOT NULL DEFAULT 0,
  status         room_status NOT NULL DEFAULT 'clean',
  blocked_reason text,
  blocked_until  timestamptz,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, number)
);

CREATE TABLE beds (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  room_id     uuid NOT NULL REFERENCES rooms(id),
  label       text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  UNIQUE (room_id, label)
);

CREATE TABLE guests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id        uuid NOT NULL REFERENCES properties(id),
  name               text NOT NULL,
  phone              text NOT NULL DEFAULT '',
  city               text NOT NULL DEFAULT '',
  address            text NOT NULL DEFAULT '',
  nationality        text NOT NULL DEFAULT 'IN',
  id_type            id_type,
  id_last4           text,                       -- never the full Aadhaar number (G3)
  id_photo_key       text,                       -- object storage key; purged after retention (G2)
  id_photo_purged_at timestamptz,
  passport_no        text,
  visa_no            text,
  visa_expiry        date,
  notes              text NOT NULL DEFAULT '',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guests_phone_idx ON guests(property_id, phone);

CREATE TABLE bookings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id              uuid NOT NULL REFERENCES properties(id),
  guest_id                 uuid NOT NULL REFERENCES guests(id),
  state                    booking_state NOT NULL,
  source                   booking_source NOT NULL DEFAULT 'walk_in',
  arrive_at                timestamptz NOT NULL,
  depart_at                timestamptz NOT NULL,
  checked_in_at            timestamptz,
  checked_out_at           timestamptz,
  adults                   integer NOT NULL DEFAULT 1,
  children                 integer NOT NULL DEFAULT 0,
  member_count             integer NOT NULL DEFAULT 1,
  purpose                  text NOT NULL DEFAULT 'pilgrimage',
  notes                    text NOT NULL DEFAULT '',
  consent_at               timestamptz,
  whatsapp_opt_in          boolean NOT NULL DEFAULT false,
  id_photo_skipped_reason  text,
  flagged_noshow_at        timestamptz,
  cancel_reason            text,
  client_uuid              uuid,                 -- idempotency key from the offline queue
  created_by               uuid REFERENCES users(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_positive_stay CHECK (depart_at > arrive_at)
);
CREATE INDEX bookings_arrive_idx ON bookings(property_id, arrive_at);
CREATE INDEX bookings_state_idx  ON bookings(property_id, state);
CREATE UNIQUE INDEX bookings_client_uuid_uq ON bookings(property_id, client_uuid);

CREATE TABLE booking_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  booking_id  uuid NOT NULL REFERENCES bookings(id),
  name        text NOT NULL,
  is_adult    boolean NOT NULL DEFAULT true,
  id_type     id_type,
  id_last4    text
);
CREATE INDEX booking_members_booking_idx ON booking_members(booking_id);

CREATE TABLE booking_units (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id),
  booking_id    uuid NOT NULL REFERENCES bookings(id),
  room_id       uuid NOT NULL REFERENCES rooms(id),
  bed_id        uuid REFERENCES beds(id),           -- set for dormitory beds
  rate_paise    bigint NOT NULL DEFAULT 0,
  arrive_at     timestamptz NOT NULL,
  depart_at     timestamptz NOT NULL,
  auto_assigned boolean NOT NULL DEFAULT false,
  cancelled_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_units_positive_stay CHECK (depart_at > arrive_at),
  -- No double booking, enforced in the database. Timestamp ranges cover day-use stays.
  CONSTRAINT booking_units_no_overlap EXCLUDE USING gist (
    COALESCE(bed_id, room_id) WITH =,
    tstzrange(arrive_at, depart_at, '[)') WITH &&
  ) WHERE (cancelled_at IS NULL)
);
CREATE INDEX booking_units_range_idx   ON booking_units(property_id, arrive_at, depart_at);
CREATE INDEX booking_units_booking_idx ON booking_units(booking_id);

CREATE TABLE folios (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         uuid NOT NULL REFERENCES properties(id),
  booking_id          uuid NOT NULL UNIQUE REFERENCES bookings(id),
  status              folio_status NOT NULL DEFAULT 'open',
  total_paise         bigint NOT NULL DEFAULT 0,  -- cached: sum of charge lines incl. tax, excl. deposits
  tax_paise           bigint NOT NULL DEFAULT 0,
  paid_paise          bigint NOT NULL DEFAULT 0,  -- cached: sum of payments (refunds negative)
  deposit_held_paise  bigint NOT NULL DEFAULT 0,  -- cached: deposits taken minus refunded
  write_off_reason    text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE folio_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  folio_id    uuid NOT NULL REFERENCES folios(id),
  kind        folio_line_kind NOT NULL,
  description text NOT NULL,
  qty         integer NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_paise  bigint NOT NULL,                    -- negative for discounts
  tax_rate_bp integer NOT NULL DEFAULT 0,         -- basis points, e.g. 500 = 5%
  cgst_paise  bigint NOT NULL DEFAULT 0,
  sgst_paise  bigint NOT NULL DEFAULT 0,
  line_date   date NOT NULL,
  auto        boolean NOT NULL DEFAULT false,     -- produced by the charge engine
  reason      text,
  approved_by uuid REFERENCES users(id),
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX folio_lines_folio_idx ON folio_lines(folio_id);

CREATE TABLE cash_handovers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES properties(id),
  user_id      uuid NOT NULL REFERENCES users(id),
  amount_paise bigint NOT NULL DEFAULT 0,
  counted_by   uuid REFERENCES users(id),
  at           timestamptz NOT NULL DEFAULT now(),
  notes        text NOT NULL DEFAULT ''
);

CREATE TABLE payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES properties(id),
  folio_id     uuid NOT NULL REFERENCES folios(id),
  mode         payment_mode NOT NULL,
  amount_paise bigint NOT NULL CHECK (amount_paise <> 0),  -- negative for refunds
  reference    text NOT NULL DEFAULT '',
  is_refund    boolean NOT NULL DEFAULT false,
  reason       text,
  received_at  timestamptz NOT NULL DEFAULT now(),
  received_by  uuid REFERENCES users(id),
  device_id    uuid REFERENCES devices(id),
  handover_id  uuid REFERENCES cash_handovers(id),
  approved_by  uuid REFERENCES users(id),
  client_uuid  uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_received_idx ON payments(property_id, received_at);
CREATE UNIQUE INDEX payments_client_uuid_uq ON payments(property_id, client_uuid);

CREATE TABLE receipt_counters (
  property_id uuid NOT NULL REFERENCES properties(id),
  fy          text NOT NULL,
  kind        receipt_kind NOT NULL,
  last        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (property_id, fy, kind)
);

CREATE TABLE receipts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id           uuid NOT NULL REFERENCES properties(id),
  folio_id              uuid NOT NULL REFERENCES folios(id),
  kind                  receipt_kind NOT NULL,
  number                text NOT NULL,
  fy                    text NOT NULL,
  snapshot              jsonb NOT NULL,           -- immutable copy of what was printed
  amount_paise          bigint NOT NULL DEFAULT 0,
  pdf_key               text,
  references_receipt_id uuid REFERENCES receipts(id),  -- credit note -> invoice
  issued_at             timestamptz NOT NULL DEFAULT now(),
  issued_by             uuid REFERENCES users(id),
  UNIQUE (property_id, fy, kind, number)
);

CREATE TABLE tax_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    uuid NOT NULL REFERENCES properties(id),
  effective_from date NOT NULL,
  rules          jsonb NOT NULL,                  -- { "slabs": [{"uptoPaise": 750000, "bp": 500}, {"bp": 1800}] }
  created_by     uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tax_rules_effective_idx ON tax_rules(property_id, effective_from);

CREATE TABLE approvals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES properties(id),
  action       text NOT NULL,
  payload      jsonb NOT NULL,
  requested_by uuid NOT NULL REFERENCES users(id),
  status       approval_status NOT NULL DEFAULT 'pending',
  decided_by   uuid REFERENCES users(id),
  decided_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE daily_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id),
  business_date date NOT NULL,
  payload       jsonb NOT NULL,
  sent_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, business_date)
);

CREATE TABLE audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid,                               -- null for platform-level actions
  user_id     uuid,
  table_name  text NOT NULL,
  row_id      text NOT NULL,
  action      text NOT NULL,
  before      jsonb,
  after       jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_at_idx ON audit_log(property_id, at);

CREATE TABLE outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid,                           -- null for platform messages (team alerts)
  channel         outbox_channel NOT NULL,
  payload         jsonb NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status          outbox_status NOT NULL DEFAULT 'pending',
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,
  send_after      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_pending_idx ON outbox(status, send_after);
