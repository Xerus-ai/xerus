-- Migration 054: Create agent_registry + add agent_slug columns
-- Phase 2 of table elimination: lightweight registry replaces 24-column agents table.
-- agent_registry preserves numeric IDs for frontend URL compatibility and FK references.

-- Create lightweight agent_registry (replaces 24-col agents table)
CREATE TABLE IF NOT EXISTS agent_registry (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL,
    user_id TEXT,
    agent_type TEXT NOT NULL DEFAULT 'private',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(slug, user_id)
);

-- Backfill from agents table (if it still exists)
INSERT INTO agent_registry (id, slug, user_id, agent_type, created_at)
SELECT id, slug, user_id, agent_type, created_at
FROM agents
WHERE slug IS NOT NULL
ON CONFLICT (slug, user_id) DO NOTHING;

-- Reset sequence to max id
SELECT setval('agent_registry_id_seq', GREATEST((SELECT COALESCE(MAX(id), 0) FROM agent_registry), 1));

-- Add agent_slug columns to FK-dependent tables
ALTER TABLE heartbeat_configs ADD COLUMN IF NOT EXISTS agent_slug TEXT;
ALTER TABLE heartbeat_state ADD COLUMN IF NOT EXISTS agent_slug TEXT;
ALTER TABLE heartbeat_executions ADD COLUMN IF NOT EXISTS agent_slug TEXT;
ALTER TABLE agent_triggers ADD COLUMN IF NOT EXISTS agent_slug TEXT;
ALTER TABLE execution_sessions ADD COLUMN IF NOT EXISTS agent_slug TEXT;
ALTER TABLE inbox_items ADD COLUMN IF NOT EXISTS agent_slug TEXT;
ALTER TABLE hook_executions ADD COLUMN IF NOT EXISTS agent_slug TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS agent_slug TEXT;
ALTER TABLE snapshot_configs ADD COLUMN IF NOT EXISTS agent_slug TEXT;
ALTER TABLE snapshot_executions ADD COLUMN IF NOT EXISTS agent_slug TEXT;

-- Backfill agent_slug from agents table
UPDATE heartbeat_configs SET agent_slug = (SELECT slug FROM agents WHERE id = heartbeat_configs.agent_id) WHERE agent_slug IS NULL;
UPDATE heartbeat_state SET agent_slug = (SELECT slug FROM agents WHERE id = heartbeat_state.agent_id) WHERE agent_slug IS NULL;
UPDATE heartbeat_executions SET agent_slug = (SELECT slug FROM agents WHERE id = heartbeat_executions.agent_id) WHERE agent_slug IS NULL;
UPDATE agent_triggers SET agent_slug = (SELECT slug FROM agents WHERE id = agent_triggers.agent_id) WHERE agent_slug IS NULL;
UPDATE execution_sessions SET agent_slug = (SELECT slug FROM agents WHERE id = execution_sessions.agent_id) WHERE agent_slug IS NULL;
UPDATE inbox_items SET agent_slug = (SELECT slug FROM agents WHERE id = inbox_items.agent_id) WHERE agent_slug IS NULL;
UPDATE hook_executions SET agent_slug = (SELECT slug FROM agents WHERE id = hook_executions.agent_id) WHERE agent_slug IS NULL;
UPDATE conversations SET agent_slug = (SELECT slug FROM agents WHERE id = conversations.agent_id) WHERE agent_slug IS NULL;
UPDATE snapshot_configs SET agent_slug = (SELECT slug FROM agents WHERE id = snapshot_configs.agent_id) WHERE agent_slug IS NULL;
UPDATE snapshot_executions SET agent_slug = (SELECT slug FROM agents WHERE id = snapshot_executions.agent_id) WHERE agent_slug IS NULL;

-- Add indexes on agent_slug for query performance
CREATE INDEX IF NOT EXISTS idx_heartbeat_configs_agent_slug ON heartbeat_configs(agent_slug);
CREATE INDEX IF NOT EXISTS idx_heartbeat_state_agent_slug ON heartbeat_state(agent_slug);
CREATE INDEX IF NOT EXISTS idx_agent_triggers_agent_slug ON agent_triggers(agent_slug);
CREATE INDEX IF NOT EXISTS idx_execution_sessions_agent_slug ON execution_sessions(agent_slug);
CREATE INDEX IF NOT EXISTS idx_inbox_items_agent_slug ON inbox_items(agent_slug);
CREATE INDEX IF NOT EXISTS idx_hook_executions_agent_slug ON hook_executions(agent_slug);
CREATE INDEX IF NOT EXISTS idx_conversations_agent_slug ON conversations(agent_slug);
