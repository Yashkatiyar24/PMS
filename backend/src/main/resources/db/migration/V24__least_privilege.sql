-- The tenant role reads who people are, never how they prove it: password and approval-PIN hashes stay with the
-- admin role, so a leaky tenant query can never hand out every property's credentials.
REVOKE SELECT ON users, property_users FROM pms_app;
GRANT SELECT (id, phone, email, name, is_super_admin, active, language, created_at, updated_at, must_change_password) ON users TO pms_app;
GRANT SELECT (property_id, user_id, role, active, created_at) ON property_users TO pms_app;

-- Row Level Security also for a table's owner. Neither runtime role owns anything today; this keeps that true
-- even if a deployment ever runs migrations as one of them.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
