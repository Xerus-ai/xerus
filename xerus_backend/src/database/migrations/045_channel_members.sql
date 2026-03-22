-- Migration: 045_channel_members.sql
-- Description: Junction table for agent-channel membership (enables colleagues query)
-- Depends: 033_v2_company_hierarchy.sql (channels), 004_agents.sql (agents)

CREATE TABLE IF NOT EXISTS channel_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id  UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    agent_id    INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    role        TEXT DEFAULT 'member',
    joined_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(channel_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_members_channel ON channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_agent ON channel_members(agent_id);

COMMENT ON TABLE channel_members IS 'Junction table: which agents belong to which channels. Used for colleagues query in Module CLAUDE.md.';
