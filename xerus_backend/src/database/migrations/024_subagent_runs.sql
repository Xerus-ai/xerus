-- Migration: 024_subagent_runs.sql
-- Description: Create subagent_runs table for lifecycle tracking
-- Depends: 022_execution_domain.sql, 004_agents.sql

-- ===== SUBAGENT_RUNS TABLE =====
-- Tracks subagent executions for lifecycle management
-- Links to parent execution sessions

CREATE TABLE IF NOT EXISTS subagent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relationship to parent execution
    parent_execution_id UUID NOT NULL REFERENCES execution_sessions(id) ON DELETE CASCADE,

    -- Agent identity
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    agent_slug VARCHAR(100) NOT NULL,

    -- SDK tracking for resume capability
    sdk_session_id TEXT,
    sdk_agent_id UUID,

    -- Execution context
    user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    task_description TEXT,

    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,

    -- Token usage
    input_tokens INTEGER,
    output_tokens INTEGER,

    -- Memory configuration (SDK memory scope)
    memory_scope VARCHAR(20) NOT NULL DEFAULT 'project',
    memory_path TEXT NOT NULL,

    -- Cleanup policy
    cleanup_policy VARCHAR(20) NOT NULL DEFAULT 'keep',
    archived_at TIMESTAMPTZ,

    -- Error tracking
    error_message TEXT,
    error_code VARCHAR(100),

    -- Metadata
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Constraints
    CONSTRAINT subagent_runs_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    CONSTRAINT subagent_runs_memory_scope_check CHECK (memory_scope IN ('user', 'project', 'local')),
    CONSTRAINT subagent_runs_cleanup_policy_check CHECK (cleanup_policy IN ('delete', 'keep', 'archive')),
    CONSTRAINT subagent_runs_duration_check CHECK (duration_ms IS NULL OR duration_ms >= 0),
    CONSTRAINT subagent_runs_tokens_check CHECK (
        (input_tokens IS NULL OR input_tokens >= 0) AND
        (output_tokens IS NULL OR output_tokens >= 0)
    )
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_subagent_runs_parent_execution ON subagent_runs(parent_execution_id);
CREATE INDEX IF NOT EXISTS idx_subagent_runs_agent_id ON subagent_runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_subagent_runs_user_id ON subagent_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_subagent_runs_status ON subagent_runs(status);
CREATE INDEX IF NOT EXISTS idx_subagent_runs_created ON subagent_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subagent_runs_sdk_session ON subagent_runs(sdk_session_id) WHERE sdk_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subagent_runs_cleanup ON subagent_runs(cleanup_policy, completed_at) WHERE archived_at IS NULL;

-- Index for finding active runs per user (for concurrency limiting)
CREATE INDEX IF NOT EXISTS idx_subagent_runs_active_user ON subagent_runs(user_id, status)
    WHERE status IN ('pending', 'running');

-- Partial index for archivable runs
CREATE INDEX IF NOT EXISTS idx_subagent_runs_archivable ON subagent_runs(completed_at)
    WHERE cleanup_policy = 'archive' AND archived_at IS NULL AND status IN ('completed', 'failed', 'cancelled');

-- Comments
COMMENT ON TABLE subagent_runs IS 'Subagent execution lifecycle tracking';
COMMENT ON COLUMN subagent_runs.parent_execution_id IS 'Links to parent execution_sessions.id';
COMMENT ON COLUMN subagent_runs.sdk_session_id IS 'SDK session ID for resume capability';
COMMENT ON COLUMN subagent_runs.sdk_agent_id IS 'Agent ID returned by Task tool for resume';
COMMENT ON COLUMN subagent_runs.memory_scope IS 'SDK memory scope: user, project, local';
COMMENT ON COLUMN subagent_runs.memory_path IS 'Full path to memory directory (.claude/agent-memory/{slug}/)';
COMMENT ON COLUMN subagent_runs.cleanup_policy IS 'delete: immediate, keep: forever, archive: after 30 days';
COMMENT ON COLUMN subagent_runs.archived_at IS 'When run was moved to archive (for archive policy)';

-- ===== TRIGGER FOR updated_at =====

CREATE OR REPLACE FUNCTION update_subagent_runs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subagent_runs_updated ON subagent_runs;
CREATE TRIGGER subagent_runs_updated
    BEFORE UPDATE ON subagent_runs
    FOR EACH ROW
    EXECUTE FUNCTION update_subagent_runs_timestamp();
