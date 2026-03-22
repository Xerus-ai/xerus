-- Migration 075: Add observability columns to execution_sessions
-- Tracks workspace setup actions and slug-filtered event counts per execution.
-- Both columns are nullable (warm sandboxes have no setup report, zero-filter runs are common).

ALTER TABLE execution_sessions
    ADD COLUMN IF NOT EXISTS setup_report JSONB DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS events_filtered INTEGER DEFAULT 0;

COMMENT ON COLUMN execution_sessions.setup_report IS 'Workspace setup actions taken: git_initialized, memory_git_initialized, sqlite_installed, duration_ms';
COMMENT ON COLUMN execution_sessions.events_filtered IS 'Number of runner events filtered out due to agent_slug mismatch (concurrent agent isolation)';
