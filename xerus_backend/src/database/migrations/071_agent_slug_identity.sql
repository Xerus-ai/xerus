-- Migration 071: Replace agent_id FK columns with agent_slug TEXT
-- on conversations, execution_sessions, hook_executions, inbox_items, tool_usage.
-- agent_registry.id stays as internal PK (heartbeat/trigger domain still uses it).
-- No FK constraint on agent_slug (slug is unique per user, not globally).

-- ===== conversations =====
ALTER TABLE conversations
    DROP CONSTRAINT IF EXISTS fk_conversations_agent,
    DROP COLUMN IF EXISTS agent_id,
    ADD COLUMN agent_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_agent_slug ON conversations(agent_slug);

-- ===== execution_sessions =====
ALTER TABLE execution_sessions
    DROP CONSTRAINT IF EXISTS fk_execution_sessions_agent,
    DROP COLUMN IF EXISTS agent_id,
    ADD COLUMN agent_slug TEXT NOT NULL DEFAULT '';

ALTER TABLE execution_sessions ALTER COLUMN agent_slug DROP DEFAULT;

CREATE INDEX IF NOT EXISTS idx_execution_sessions_agent_slug ON execution_sessions(agent_slug);

-- ===== hook_executions =====
ALTER TABLE hook_executions
    DROP CONSTRAINT IF EXISTS fk_hook_executions_agent,
    DROP COLUMN IF EXISTS agent_id,
    ADD COLUMN agent_slug TEXT NOT NULL DEFAULT '';

ALTER TABLE hook_executions ALTER COLUMN agent_slug DROP DEFAULT;

CREATE INDEX IF NOT EXISTS idx_hook_executions_agent_slug ON hook_executions(agent_slug);

-- ===== inbox_items =====
ALTER TABLE inbox_items
    DROP CONSTRAINT IF EXISTS fk_inbox_items_agent,
    DROP COLUMN IF EXISTS agent_id,
    ADD COLUMN agent_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_inbox_items_agent_slug ON inbox_items(agent_slug);

-- ===== tool_usage =====
ALTER TABLE tool_usage
    DROP CONSTRAINT IF EXISTS fk_tool_usage_agent,
    DROP COLUMN IF EXISTS agent_id,
    ADD COLUMN agent_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_tool_usage_agent_slug ON tool_usage(agent_slug);
