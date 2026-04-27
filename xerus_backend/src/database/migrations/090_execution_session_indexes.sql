-- Performance indexes for execution_sessions queries
-- Covers: workspace-scoped session listing (sorted by recency)
-- Covers: watchdog/admin queries filtering by running status

CREATE INDEX CONCURRENTLY idx_execution_sessions_ws_started
    ON execution_sessions(workspace_id, started_at DESC);

CREATE INDEX CONCURRENTLY idx_execution_sessions_status_started
    ON execution_sessions(status, started_at) WHERE status = 'running';
