-- Migration 062: Add missing FK constraints
-- tool_executions.agent_id and memory_search_index.agent_id had no FK to agent_registry.
-- Also fix orphaned agent_id=0 rows (placeholder, not a real agent).

UPDATE tool_executions SET agent_id = NULL WHERE agent_id = 0;

ALTER TABLE tool_executions
    ADD CONSTRAINT fk_tool_executions_agent
    FOREIGN KEY (agent_id) REFERENCES agent_registry(id) ON DELETE SET NULL;

ALTER TABLE memory_search_index
    ADD CONSTRAINT fk_memory_search_index_agent
    FOREIGN KEY (agent_id) REFERENCES agent_registry(id) ON DELETE CASCADE;
