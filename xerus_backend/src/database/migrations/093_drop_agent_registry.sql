-- Migration 093: Drop agent_registry table
--
-- Consolidates agent identity management into workspace.db (SQLite in Daytona sandbox).
-- Follows the pattern established by migration 071 (agent_id → agent_slug conversion).
-- Production has test data only — greenfield, no backward compatibility needed.
--
-- Converts the 3 remaining agent_id integer FK columns to agent_slug TEXT,
-- drops the orphaned memory_search_index.channel_id FK, then drops agent_registry.

-- ===== 1. agent_triggers: agent_id → agent_slug =====

ALTER TABLE agent_triggers ADD COLUMN IF NOT EXISTS agent_slug TEXT;

UPDATE agent_triggers SET agent_slug = ar.slug
FROM agent_registry ar WHERE agent_triggers.agent_id = ar.id
AND agent_triggers.agent_slug IS NULL;

ALTER TABLE agent_triggers
    DROP CONSTRAINT IF EXISTS fk_agent_triggers_agent;

ALTER TABLE agent_triggers
    DROP CONSTRAINT IF EXISTS agent_triggers_unique;

DROP INDEX IF EXISTS idx_agent_triggers_agent_id;
DROP INDEX IF EXISTS idx_agent_triggers_enabled;

ALTER TABLE agent_triggers DROP COLUMN IF EXISTS agent_id;

ALTER TABLE agent_triggers
    ADD CONSTRAINT agent_triggers_slug_unique UNIQUE (agent_slug, user_id, app_slug, event_type);

CREATE INDEX IF NOT EXISTS idx_agent_triggers_agent_slug ON agent_triggers(agent_slug);
CREATE INDEX IF NOT EXISTS idx_agent_triggers_enabled_slug ON agent_triggers(agent_slug) WHERE enabled = true;

-- ===== 2. tool_executions: agent_id → agent_slug =====

ALTER TABLE tool_executions ADD COLUMN IF NOT EXISTS agent_slug TEXT;

UPDATE tool_executions SET agent_slug = ar.slug
FROM agent_registry ar WHERE tool_executions.agent_id = ar.id
AND tool_executions.agent_slug IS NULL;

ALTER TABLE tool_executions
    DROP CONSTRAINT IF EXISTS fk_tool_executions_agent;

ALTER TABLE tool_executions DROP COLUMN IF EXISTS agent_id;

CREATE INDEX IF NOT EXISTS idx_tool_executions_agent_slug ON tool_executions(agent_slug);

-- ===== 3. memory_search_index: agent_id → agent_slug =====

ALTER TABLE memory_search_index ADD COLUMN IF NOT EXISTS agent_slug TEXT;

UPDATE memory_search_index SET agent_slug = ar.slug
FROM agent_registry ar WHERE memory_search_index.agent_id = ar.id
AND memory_search_index.agent_slug IS NULL;

ALTER TABLE memory_search_index
    DROP CONSTRAINT IF EXISTS fk_memory_search_index_agent;

ALTER TABLE memory_search_index DROP COLUMN IF EXISTS agent_id;

CREATE INDEX IF NOT EXISTS idx_memory_search_index_agent_slug ON memory_search_index(agent_slug);

-- ===== 4. Drop orphaned FK on memory_search_index.channel_id =====
-- channels table was dropped in migration 084 but this FK was never cleaned up.

ALTER TABLE memory_search_index
    DROP CONSTRAINT IF EXISTS fk_memory_search_index_channel;

-- ===== 5. Drop agent_registry =====

DROP TABLE IF EXISTS agent_registry;
