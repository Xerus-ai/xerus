-- Migration: 029_chat_executions.sql
-- Description: Create chat_executions table for ad-hoc team execution records
-- Depends: 001_users.sql, 004_agents.sql

CREATE TABLE IF NOT EXISTS chat_executions (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(255) NOT NULL,

    -- User input
    message TEXT NOT NULL,
    agent_mentions TEXT[] NOT NULL,

    -- Execution details
    coordination_mode VARCHAR(50) NOT NULL,
    mode_confidence DECIMAL(3,2),
    team_config JSONB NOT NULL,

    -- Results
    execution_result JSONB NOT NULL,
    success BOOLEAN NOT NULL,
    error_message TEXT,

    -- Metrics
    total_duration_ms INTEGER,
    total_tokens_used INTEGER,
    agents_executed INTEGER,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT fk_chat_executions_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Index: user + session lookup
CREATE INDEX IF NOT EXISTS idx_chat_executions_user_session
    ON chat_executions(user_id, session_id);

-- Index: GIN on agent_mentions array for searching by agent
CREATE INDEX IF NOT EXISTS idx_chat_executions_agent_mentions
    ON chat_executions USING GIN (agent_mentions);

-- Index: recent executions by user
CREATE INDEX IF NOT EXISTS idx_chat_executions_created
    ON chat_executions(user_id, created_at DESC);

COMMENT ON TABLE chat_executions IS 'Ad-hoc team execution records from @mention chat interface';
COMMENT ON COLUMN chat_executions.agent_mentions IS 'Array of agent slugs mentioned in message';
COMMENT ON COLUMN chat_executions.coordination_mode IS 'Detected or user-selected coordination mode';
COMMENT ON COLUMN chat_executions.team_config IS 'Full ad-hoc team configuration JSONB';
COMMENT ON COLUMN chat_executions.execution_result IS 'Execution results including per-agent outputs';
