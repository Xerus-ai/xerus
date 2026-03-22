-- Migration 056: Consolidate agent_id references after agents table drop
--
-- After migration 055 dropped the `agents` table, agent_id columns in dependent
-- tables still hold valid IDs that match agent_registry.id (same numeric values).
-- Rather than migrating 30+ repository files to agent_slug (massive refactor,
-- zero benefit since IDs are identical), we:
--   1. Add FK constraints from agent_id -> agent_registry(id) for referential integrity
--   2. Drop the redundant agent_slug columns added by migration 054 (unused by repos)
--   3. Keep agent_id as the primary lookup key (integer = faster than text)

-- Step 1: Add FK constraints to agent_registry
-- Using SET NULL on delete so heartbeat history is preserved when an agent is removed
ALTER TABLE heartbeat_configs
    ADD CONSTRAINT fk_heartbeat_configs_agent
    FOREIGN KEY (agent_id) REFERENCES agent_registry(id) ON DELETE CASCADE;

ALTER TABLE heartbeat_state
    ADD CONSTRAINT fk_heartbeat_state_agent
    FOREIGN KEY (agent_id) REFERENCES agent_registry(id) ON DELETE CASCADE;

ALTER TABLE heartbeat_executions
    ADD CONSTRAINT fk_heartbeat_executions_agent
    FOREIGN KEY (agent_id) REFERENCES agent_registry(id) ON DELETE SET NULL;

ALTER TABLE agent_triggers
    ADD CONSTRAINT fk_agent_triggers_agent
    FOREIGN KEY (agent_id) REFERENCES agent_registry(id) ON DELETE CASCADE;

ALTER TABLE execution_sessions
    ADD CONSTRAINT fk_execution_sessions_agent
    FOREIGN KEY (agent_id) REFERENCES agent_registry(id) ON DELETE SET NULL;

ALTER TABLE inbox_items
    ADD CONSTRAINT fk_inbox_items_agent
    FOREIGN KEY (agent_id) REFERENCES agent_registry(id) ON DELETE SET NULL;

ALTER TABLE hook_executions
    ADD CONSTRAINT fk_hook_executions_agent
    FOREIGN KEY (agent_id) REFERENCES agent_registry(id) ON DELETE SET NULL;

ALTER TABLE conversations
    ADD CONSTRAINT fk_conversations_agent
    FOREIGN KEY (agent_id) REFERENCES agent_registry(id) ON DELETE SET NULL;

ALTER TABLE snapshot_configs
    ADD CONSTRAINT fk_snapshot_configs_agent
    FOREIGN KEY (agent_id) REFERENCES agent_registry(id) ON DELETE CASCADE;

ALTER TABLE snapshot_executions
    ADD CONSTRAINT fk_snapshot_executions_agent
    FOREIGN KEY (agent_id) REFERENCES agent_registry(id) ON DELETE SET NULL;

-- Step 2: Drop redundant agent_slug columns (no repos query by them)
ALTER TABLE heartbeat_configs DROP COLUMN IF EXISTS agent_slug;
ALTER TABLE heartbeat_state DROP COLUMN IF EXISTS agent_slug;
ALTER TABLE heartbeat_executions DROP COLUMN IF EXISTS agent_slug;
ALTER TABLE agent_triggers DROP COLUMN IF EXISTS agent_slug;
ALTER TABLE execution_sessions DROP COLUMN IF EXISTS agent_slug;
ALTER TABLE inbox_items DROP COLUMN IF EXISTS agent_slug;
ALTER TABLE hook_executions DROP COLUMN IF EXISTS agent_slug;
ALTER TABLE conversations DROP COLUMN IF EXISTS agent_slug;
ALTER TABLE snapshot_configs DROP COLUMN IF EXISTS agent_slug;
ALTER TABLE snapshot_executions DROP COLUMN IF EXISTS agent_slug;
