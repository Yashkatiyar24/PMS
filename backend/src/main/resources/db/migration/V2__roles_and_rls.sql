-- Two database roles:
--   pms_app   : what the API uses for tenant work. Row Level Security applies.
--   pms_admin : auth, sessions, jobs and cross-property owner views. Bypasses RLS.
-- Neither owns the tables, so RLS is enforced on both unless BYPASSRLS is set.
-- Change the passwords in production: ALTER ROLE pms_app PASSWORD '...';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pms_app') THEN
    CREATE ROLE pms_app LOGIN PASSWORD 'pms_app' NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pms_admin') THEN
    CREATE ROLE pms_admin LOGIN PASSWORD 'pms_admin' BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO pms_app, pms_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pms_app, pms_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pms_app, pms_admin;

-- The audit log is append-only for everyone except the migration owner.
REVOKE UPDATE, DELETE ON audit_log FROM pms_app, pms_admin;
-- Receipts are immutable once issued (only pdf_key may be filled in later, via admin).
REVOKE UPDATE, DELETE ON receipts FROM pms_app;
-- The app role never touches auth tables directly.
REVOKE ALL ON sessions, otp_codes, users, property_users, push_tokens, plans, organisations, job_runs FROM pms_app;
GRANT SELECT ON users, property_users TO pms_app;

-- Row Level Security. The transaction sets app.property_id; an unset value yields NULL,
-- which matches nothing, so a query without a tenant sees no rows and writes nothing.
CREATE OR REPLACE FUNCTION current_property_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.property_id', true), '')::uuid
  $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'devices','room_types','rooms','beds','guests','bookings','booking_members','booking_units',
    'folios','folio_lines','cash_handovers','payments','receipt_counters','receipts','tax_rules',
    'approvals','daily_reports','audit_log','outbox'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant ON %I USING (property_id = current_property_id()) WITH CHECK (property_id = current_property_id())', t);
  END LOOP;
END $$;

-- The app role may only see the property it is working in.
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON properties USING (id = current_property_id()) WITH CHECK (id = current_property_id());
