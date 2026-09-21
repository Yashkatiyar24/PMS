-- The runtime roles take the passwords this deployment configured (PMS_DB_APP_PASSWORD, PMS_DB_ADMIN_PASSWORD),
-- so a fresh database never runs on the values V2 created them with. Dollar quoting keeps any character safe.
-- Rotating a password later is ALTER ROLE by hand, then the matching environment variable.
ALTER ROLE pms_app PASSWORD $pw$${pms_app_password}$pw$;
ALTER ROLE pms_admin PASSWORD $pw$${pms_admin_password}$pw$;
