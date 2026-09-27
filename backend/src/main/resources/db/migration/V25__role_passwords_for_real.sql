-- V23 meant to give the runtime roles the configured passwords, but Flyway does not replace placeholders
-- inside dollar-quoted strings, so on any fresh database the roles were left with the literal text
-- '${pms_app_password}' as their password and the API could not sign in to its own database.
-- Single-quoted, the placeholders are substituted. The values come from PMS_DB_APP_PASSWORD and
-- PMS_DB_ADMIN_PASSWORD, which therefore must not contain a single quote.
ALTER ROLE pms_app PASSWORD '${pms_app_password}';
ALTER ROLE pms_admin PASSWORD '${pms_admin_password}';
