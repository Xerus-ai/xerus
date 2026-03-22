-- Migration: 033_v2_company_hierarchy.sql
-- Description: Add company hierarchy tables (domains, channels, channel_messages) and extend agents table
-- Depends: 004_agents.sql, 001_users.sql
-- Reference: docs/planning/execution/EXECUTION_ARCHITECTURE_v2.md Section 7

-- ===== 1. ALTER AGENTS TABLE =====
-- Add columns for domain/channel hierarchy (read cache for frontend)

ALTER TABLE agents ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS domain TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS primary_channel TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS channels TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE agents ADD COLUMN IF NOT EXISTS heartbeat_summary TEXT;

-- Unique slug per user (partial index: only where slug is set)
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_slug_per_user
    ON agents(user_id, slug)
    WHERE slug IS NOT NULL;

-- Fast lookup by domain for a user
CREATE INDEX IF NOT EXISTS idx_agents_domain
    ON agents(user_id, domain);

COMMENT ON COLUMN agents.slug IS 'URL-safe identifier for the agent within a user workspace';
COMMENT ON COLUMN agents.domain IS 'Department/domain slug this agent belongs to (e.g. marketing, sales)';
COMMENT ON COLUMN agents.primary_channel IS 'Primary channel slug where agent posts by default';
COMMENT ON COLUMN agents.channels IS 'All channel slugs this agent is a member of';
COMMENT ON COLUMN agents.heartbeat_summary IS 'Last heartbeat summary for quick status display in frontend';

-- ===== 2. DOMAINS TABLE =====
-- Represents departments/divisions in the company hierarchy

CREATE TABLE IF NOT EXISTS domains (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    slug        TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_domains_user ON domains(user_id);

COMMENT ON TABLE domains IS 'Company departments/divisions - mirrors workspace/projects/{slug}/ hierarchy';
COMMENT ON COLUMN domains.slug IS 'URL-safe identifier unique per user (e.g. marketing, sales, engineering)';

-- ===== 3. CHANNELS TABLE =====
-- Represents team channels within a domain

CREATE TABLE IF NOT EXISTS channels (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id   UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    user_id     VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    slug        TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    agent_count INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(domain_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_channels_domain ON channels(domain_id);
CREATE INDEX IF NOT EXISTS idx_channels_user ON channels(user_id);

COMMENT ON TABLE channels IS 'Team channels within a domain - mirrors workspace/projects/{domain}/channels/{slug}/';
COMMENT ON COLUMN channels.slug IS 'URL-safe identifier unique per domain (e.g. seo, ads, general)';
COMMENT ON COLUMN channels.agent_count IS 'Denormalized count of agents assigned to this channel';

-- ===== 4. CHANNEL MESSAGES TABLE =====
-- Chat history for frontend rendering (populated by runner)

CREATE TABLE IF NOT EXISTS channel_messages (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id   UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    sender_type  TEXT NOT NULL,
    sender_slug  TEXT NOT NULL,
    content      TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'chat',
    metadata     JSONB DEFAULT '{}',
    created_at   TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT channel_messages_sender_type_check
        CHECK (sender_type IN ('agent', 'human', 'system')),
    CONSTRAINT channel_messages_type_check
        CHECK (message_type IN ('chat', 'task_update', 'status', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_channel_messages_channel
    ON channel_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_messages_sender
    ON channel_messages(sender_slug);

COMMENT ON TABLE channel_messages IS 'Channel chat history for frontend rendering without waking sandbox';
COMMENT ON COLUMN channel_messages.sender_type IS 'agent=AI agent, human=user, system=platform notification';
COMMENT ON COLUMN channel_messages.message_type IS 'chat=normal message, task_update=beads task change, status=agent status, system=platform event';
COMMENT ON COLUMN channel_messages.metadata IS 'Flexible metadata: task_id, execution_id, attachments, etc.';

-- ===== 5. UPDATED_AT TRIGGERS =====
-- Reuse the generic update function created in 021_behaviour_config.sql

DROP TRIGGER IF EXISTS set_domains_updated_at ON domains;
CREATE TRIGGER set_domains_updated_at
    BEFORE UPDATE ON domains
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_channels_updated_at ON channels;
CREATE TRIGGER set_channels_updated_at
    BEFORE UPDATE ON channels
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
