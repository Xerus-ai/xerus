-- Migration 061: Drop orphaned run_id from tool_executions
-- run_id was FK to agent_runs (dropped in migration 053).
-- execution_sessions uses UUID id, so repurposing is not possible.
-- Code always passed null for this column.

ALTER TABLE tool_executions DROP COLUMN IF EXISTS run_id;
