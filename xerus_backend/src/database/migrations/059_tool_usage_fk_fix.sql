-- Migration 059: Add FK from tool_usage.agent_id to agent_registry
-- The original FK to agents(id) was lost when agents was dropped CASCADE in migration 055.

ALTER TABLE tool_usage
    ADD CONSTRAINT fk_tool_usage_agent
    FOREIGN KEY (agent_id) REFERENCES agent_registry(id) ON DELETE SET NULL;
