-- The runtime roles take the passwords this deployment configured (PMS_DB_APP_PASSWORD, PMS_DB_ADMIN_PASSWORD).
-- Single-quoted: Flyway does not replace placeholders inside dollar-quoted strings, so the values must not
-- contain a single quote. Since V2 now uses the same placeholders this is a no-op on a fresh database.
ALTER ROLE pms_app PASSWORD '${pms_app_password}';
ALTER ROLE pms_admin PASSWORD '${pms_admin_password}';
