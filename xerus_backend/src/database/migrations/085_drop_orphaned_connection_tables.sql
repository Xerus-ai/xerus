-- Migration 085: Drop orphaned connection tables
-- These tables were dropped in migration 068 but re-created by test setup code
-- (trigger-registration.service.test.ts beforeAll). Production code uses
-- connected_accounts for all connection lookups (trigger-resolver.service.ts).
-- Zero production consumers. Safe to drop.

DROP TABLE IF EXISTS user_pipedream_connections CASCADE;
DROP TABLE IF EXISTS user_native_connections CASCADE;
