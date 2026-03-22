-- Migration: 012_execution_domain.sql
-- Description: Create execution domain tables for sandbox orchestration
-- Depends: 001_users.sql, 004_agents.sql

-- ===== 1. SANDBOX_REGISTRY TABLE =====
-- Tracks per-user Daytona sandbox instances
-- One sandbox per user, all agents share

CREATE TABLE IF NOT EXISTS sandbox_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    sandbox_id TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    template_version TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_activity_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    paused_at TIMESTAMPTZ,

    CONSTRAINT sandbox_registry_status_check CHECK (status IN ('running', 'paused', 'stopped', 'archived', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_sandbox_registry_user_id ON sandbox_registry(user_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_registry_status ON sandbox_registry(status);
CREATE INDEX IF NOT EXISTS idx_sandbox_registry_sandbox_id ON sandbox_registry(sandbox_id);

COMMENT ON TABLE sandbox_registry IS 'Per-user Daytona sandbox instances';
COMMENT ON COLUMN sandbox_registry.sandbox_id IS 'Daytona sandbox identifier';
COMMENT ON COLUMN sandbox_registry.status IS 'running, paused, stopped, archived, error';
COMMENT ON COLUMN sandbox_registry.template_version IS 'Sandbox template version for upgrades';

-- ===== 2. USER_WORKSPACES TABLE =====
-- S3 workspace storage metadata per user

CREATE TABLE IF NOT EXISTS user_workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    s3_bucket TEXT NOT NULL DEFAULT 'xerus-agents',
    s3_prefix TEXT NOT NULL,
    total_size_bytes BIGINT DEFAULT 0 NOT NULL,
    file_count INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_synced_at TIMESTAMPTZ,

    CONSTRAINT user_workspaces_size_check CHECK (total_size_bytes >= 0),
    CONSTRAINT user_workspaces_count_check CHECK (file_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_user_workspaces_user_id ON user_workspaces(user_id);

COMMENT ON TABLE user_workspaces IS 'S3 workspace storage metadata per user';
COMMENT ON COLUMN user_workspaces.s3_prefix IS 'S3 key prefix for user workspace files';
COMMENT ON COLUMN user_workspaces.total_size_bytes IS 'Aggregate storage usage in bytes';

-- ===== 3. EXECUTION_SESSIONS TABLE =====
-- Agent execution session tracking

CREATE TABLE IF NOT EXISTS execution_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES user_workspaces(id) ON DELETE CASCADE,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    sandbox_id TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    trigger_type VARCHAR(50),
    input_tokens INTEGER,
    output_tokens INTEGER,
    credits_used DECIMAL(10, 4),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    CONSTRAINT execution_sessions_status_check CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')),
    CONSTRAINT execution_sessions_trigger_check CHECK (trigger_type IS NULL OR trigger_type IN ('manual', 'scheduled', 'webhook', 'event', 'heartbeat'))
);

CREATE INDEX IF NOT EXISTS idx_execution_sessions_workspace_id ON execution_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_execution_sessions_agent_id ON execution_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_execution_sessions_status ON execution_sessions(status);
CREATE INDEX IF NOT EXISTS idx_execution_sessions_created ON execution_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_sessions_sandbox ON execution_sessions(sandbox_id);

COMMENT ON TABLE execution_sessions IS 'Agent execution session tracking';
COMMENT ON COLUMN execution_sessions.trigger_type IS 'manual, scheduled, webhook, event, heartbeat';
COMMENT ON COLUMN execution_sessions.credits_used IS 'Credit consumption for billing';

-- ===== 4. HOOK_EXECUTIONS TABLE =====
-- SDK hook execution audit log

CREATE TABLE IF NOT EXISTS hook_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES execution_sessions(id) ON DELETE CASCADE,
    hook_event VARCHAR(50) NOT NULL,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    payload JSONB,
    result JSONB,
    blocked BOOLEAN DEFAULT false NOT NULL,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    CONSTRAINT hook_executions_event_check CHECK (hook_event IN (
        'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
        'PreCompact', 'SessionEnd', 'Stop', 'SubagentStop', 'Notification',
        'TeammateIdle', 'TaskCompleted'
    ))
);

CREATE INDEX IF NOT EXISTS idx_hook_executions_execution_id ON hook_executions(execution_id);
CREATE INDEX IF NOT EXISTS idx_hook_executions_hook_event ON hook_executions(hook_event);
CREATE INDEX IF NOT EXISTS idx_hook_executions_agent_id ON hook_executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_hook_executions_user_id ON hook_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_hook_executions_created ON hook_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hook_executions_blocked ON hook_executions(blocked) WHERE blocked = true;

COMMENT ON TABLE hook_executions IS 'SDK hook execution audit log';
COMMENT ON COLUMN hook_executions.hook_event IS '9 core hooks + 2 team-specific hooks';
COMMENT ON COLUMN hook_executions.blocked IS 'Whether hook blocked the operation';

-- ===== 5. EXECUTION_QUEUE TABLE =====
-- Pending execution requests for queue-based processing

CREATE TABLE IF NOT EXISTS execution_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    priority INTEGER DEFAULT 5 NOT NULL,
    trigger_type VARCHAR(50) NOT NULL,
    prompt TEXT,
    metadata JSONB,
    status VARCHAR(20) DEFAULT 'queued' NOT NULL,
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    CONSTRAINT execution_queue_priority_check CHECK (priority >= 1 AND priority <= 10),
    CONSTRAINT execution_queue_status_check CHECK (status IN ('queued', 'claimed', 'processing', 'completed', 'failed')),
    CONSTRAINT execution_queue_trigger_check CHECK (trigger_type IN ('manual', 'scheduled', 'webhook', 'event', 'heartbeat'))
);

CREATE INDEX IF NOT EXISTS idx_execution_queue_user_id ON execution_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_execution_queue_status_priority ON execution_queue(status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_execution_queue_agent_id ON execution_queue(agent_id);
CREATE INDEX IF NOT EXISTS idx_execution_queue_created ON execution_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_execution_queue_claimed ON execution_queue(claimed_at) WHERE claimed_at IS NOT NULL;

COMMENT ON TABLE execution_queue IS 'Pending execution requests for queue-based processing';
COMMENT ON COLUMN execution_queue.priority IS '1-10, higher is more urgent';
COMMENT ON COLUMN execution_queue.claimed_at IS 'When a worker claimed this job';

-- ===== 6. EXECUTION_LANES TABLE =====
-- Per-user concurrency control slots

CREATE TABLE IF NOT EXISTS execution_lanes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    lane_number INTEGER NOT NULL,
    current_execution_id UUID REFERENCES execution_sessions(id) ON DELETE SET NULL,
    busy BOOLEAN DEFAULT false NOT NULL,
    last_activity_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    CONSTRAINT execution_lanes_unique UNIQUE (user_id, lane_number),
    CONSTRAINT execution_lanes_lane_check CHECK (lane_number >= 1 AND lane_number <= 10)
);

CREATE INDEX IF NOT EXISTS idx_execution_lanes_user_busy ON execution_lanes(user_id, busy);
CREATE INDEX IF NOT EXISTS idx_execution_lanes_current ON execution_lanes(current_execution_id) WHERE current_execution_id IS NOT NULL;

COMMENT ON TABLE execution_lanes IS 'Per-user concurrency control slots';
COMMENT ON COLUMN execution_lanes.lane_number IS 'Lane slot number 1-10 based on plan';
COMMENT ON COLUMN execution_lanes.busy IS 'Whether lane is currently executing';

-- ===== 7. EXECUTION_PAUSE_STATES TABLE =====
-- HITL pause states for user approval workflows

CREATE TABLE IF NOT EXISTS execution_pause_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES execution_sessions(id) ON DELETE CASCADE,
    paused_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    reason VARCHAR(50) NOT NULL,
    request_data JSONB,
    resolved_at TIMESTAMPTZ,
    resolution VARCHAR(20),
    resolved_by VARCHAR(255) REFERENCES users(user_id) ON DELETE SET NULL,

    CONSTRAINT pause_states_reason_check CHECK (reason IN ('approval_required', 'budget_exceeded', 'error', 'manual', 'permission_denied')),
    CONSTRAINT pause_states_resolution_check CHECK (resolution IS NULL OR resolution IN ('approved', 'rejected', 'timeout', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_execution_pause_states_execution_id ON execution_pause_states(execution_id);
CREATE INDEX IF NOT EXISTS idx_execution_pause_states_resolved_at ON execution_pause_states(resolved_at);
CREATE INDEX IF NOT EXISTS idx_execution_pause_states_pending ON execution_pause_states(execution_id) WHERE resolved_at IS NULL;

COMMENT ON TABLE execution_pause_states IS 'HITL pause states for user approval workflows';
COMMENT ON COLUMN execution_pause_states.reason IS 'approval_required, budget_exceeded, error, manual, permission_denied';
COMMENT ON COLUMN execution_pause_states.resolution IS 'approved, rejected, timeout, cancelled';

-- ===== TRIGGER FOR updated_at ON sandbox_registry =====

CREATE OR REPLACE FUNCTION update_sandbox_registry_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_activity_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sandbox_registry_activity ON sandbox_registry;
CREATE TRIGGER sandbox_registry_activity
    BEFORE UPDATE ON sandbox_registry
    FOR EACH ROW
    EXECUTE FUNCTION update_sandbox_registry_timestamp();

-- ===== TRIGGER FOR updated_at ON execution_lanes =====

CREATE OR REPLACE FUNCTION update_execution_lanes_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_activity_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS execution_lanes_activity ON execution_lanes;
CREATE TRIGGER execution_lanes_activity
    BEFORE UPDATE ON execution_lanes
    FOR EACH ROW
    EXECUTE FUNCTION update_execution_lanes_timestamp();
