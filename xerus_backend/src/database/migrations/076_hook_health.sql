-- Migration 076: Add hook_health column to execution_sessions
-- Stores post-execution shell hook verification results.
-- Nullable: null means health check was skipped or failed gracefully.

ALTER TABLE execution_sessions
    ADD COLUMN IF NOT EXISTS hook_health JSONB DEFAULT NULL;

COMMENT ON COLUMN execution_sessions.hook_health IS 'Post-execution shell hook health: hooks_fired, hooks_expected_missing, audit_entries, activity_entries, company_db_initialized, checked_at';
