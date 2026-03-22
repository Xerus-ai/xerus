-- Migration: 030_session_checkpoints.sql
-- Description: Create session_checkpoints table for workflow checkpoint/resume
-- Depends: 022_execution_domain.sql (execution_sessions table)
-- Spec: docs/planning/execution/session-persistence.md

-- ===== SESSION_CHECKPOINTS TABLE =====
-- Checkpoint state snapshots for resumable multi-session workflows

CREATE TABLE IF NOT EXISTS session_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES execution_sessions(id) ON DELETE CASCADE,
    checkpoint_number INTEGER NOT NULL,
    phase VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    completed_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    current_step TEXT,
    remaining_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    context_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    trigger_source VARCHAR(30) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    CONSTRAINT session_checkpoints_phase_check CHECK (phase IN ('planning', 'execution', 'validation', 'complete')),
    CONSTRAINT session_checkpoints_status_check CHECK (status IN ('active', 'superseded', 'expired')),
    CONSTRAINT session_checkpoints_trigger_check CHECK (trigger_source IN ('step_complete', 'pre_compact', 'session_end', 'user_pause', 'error_recovery')),
    CONSTRAINT session_checkpoints_number_positive CHECK (checkpoint_number > 0),
    CONSTRAINT session_checkpoints_unique_active UNIQUE (execution_id, status) WHERE (status = 'active')
);

-- Index for finding latest checkpoint per execution (most common query)
CREATE INDEX IF NOT EXISTS idx_session_checkpoints_execution_active
ON session_checkpoints(execution_id, checkpoint_number DESC)
WHERE status = 'active';

-- Index for listing all checkpoints per execution
CREATE INDEX IF NOT EXISTS idx_session_checkpoints_execution_id
ON session_checkpoints(execution_id, checkpoint_number DESC);

-- Index for expiration cleanup queries
CREATE INDEX IF NOT EXISTS idx_session_checkpoints_created
ON session_checkpoints(created_at)
WHERE status != 'expired';

-- Index for finding resumable sessions (joined with execution_sessions)
CREATE INDEX IF NOT EXISTS idx_session_checkpoints_status
ON session_checkpoints(status)
WHERE status = 'active';

COMMENT ON TABLE session_checkpoints IS 'Checkpoint state snapshots for resumable multi-session workflows';
COMMENT ON COLUMN session_checkpoints.checkpoint_number IS 'Monotonically increasing checkpoint counter per execution';
COMMENT ON COLUMN session_checkpoints.phase IS 'planning, execution, validation, complete';
COMMENT ON COLUMN session_checkpoints.status IS 'active (current), superseded (older), expired (past retention)';
COMMENT ON COLUMN session_checkpoints.completed_steps IS 'JSONB array of completed step identifiers';
COMMENT ON COLUMN session_checkpoints.current_step IS 'Step identifier in progress at checkpoint time';
COMMENT ON COLUMN session_checkpoints.remaining_steps IS 'JSONB array of remaining step identifiers';
COMMENT ON COLUMN session_checkpoints.context_summary IS 'JSONB: user_goal, key_decisions, files_modified, pending_files, accumulated_tokens';
COMMENT ON COLUMN session_checkpoints.trigger_source IS 'What caused checkpoint: step_complete, pre_compact, session_end, user_pause, error_recovery';
