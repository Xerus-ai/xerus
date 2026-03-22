-- Migration: 023_triggers.sql
-- Description: Create trigger provider and agent trigger tables for unified heartbeat system
-- Depends: 001_users.sql, 004_agents.sql

-- ===== 1. TRIGGER_PROVIDERS TABLE =====
-- Available trigger providers (Pipedream, native webhooks, future: Zapier)

CREATE TABLE IF NOT EXISTS trigger_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    adapter_config JSONB DEFAULT '{}' NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trigger_providers_slug ON trigger_providers(slug);
CREATE INDEX IF NOT EXISTS idx_trigger_providers_active ON trigger_providers(is_active) WHERE is_active = true;

COMMENT ON TABLE trigger_providers IS 'Available trigger providers (Pipedream, native webhooks, etc.)';
COMMENT ON COLUMN trigger_providers.slug IS 'Unique identifier for provider (pipedream, native, zapier)';
COMMENT ON COLUMN trigger_providers.adapter_config IS 'Provider-specific configuration (API endpoints, etc.)';
COMMENT ON COLUMN trigger_providers.is_active IS 'Whether this provider is currently available';

-- Seed default providers
INSERT INTO trigger_providers (slug, display_name, adapter_config) VALUES
    ('pipedream', 'Pipedream Connect', '{"base_url": "https://api.pipedream.com"}'),
    ('native', 'Native Webhooks', '{"supported_apps": ["github", "stripe", "slack"]}')
ON CONFLICT (slug) DO NOTHING;

-- ===== 2. AGENT_TRIGGERS TABLE =====
-- Registered event triggers per agent

CREATE TABLE IF NOT EXISTS agent_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    app_slug VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    provider_id UUID REFERENCES trigger_providers(id) ON DELETE SET NULL,
    external_id VARCHAR(200),
    webhook_url TEXT,
    filter_config JSONB DEFAULT '{}' NOT NULL,
    account_id VARCHAR(255),
    enabled BOOLEAN DEFAULT true NOT NULL,
    last_fired_at TIMESTAMPTZ,
    fire_count INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    CONSTRAINT agent_triggers_unique UNIQUE (agent_id, app_slug, event_type),
    CONSTRAINT agent_triggers_fire_count_check CHECK (fire_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_agent_triggers_agent_id ON agent_triggers(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_triggers_user_id ON agent_triggers(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_triggers_enabled ON agent_triggers(agent_id) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_agent_triggers_lookup ON agent_triggers(app_slug, event_type) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_agent_triggers_external ON agent_triggers(external_id, provider_id) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_agent_triggers_provider ON agent_triggers(provider_id);

COMMENT ON TABLE agent_triggers IS 'Registered event triggers per agent';
COMMENT ON COLUMN agent_triggers.app_slug IS 'App identifier (gmail, github, slack, stripe)';
COMMENT ON COLUMN agent_triggers.event_type IS 'Event type (new_email, pr_opened, payment_failed)';
COMMENT ON COLUMN agent_triggers.provider_id IS 'Which provider handles this trigger';
COMMENT ON COLUMN agent_triggers.external_id IS 'Provider-specific trigger/subscription ID';
COMMENT ON COLUMN agent_triggers.webhook_url IS 'Our webhook endpoint for receiving events';
COMMENT ON COLUMN agent_triggers.filter_config IS 'Optional event filters (e.g., from:vip-list)';
COMMENT ON COLUMN agent_triggers.account_id IS 'User connected account for this app';
COMMENT ON COLUMN agent_triggers.fire_count IS 'Total times this trigger has fired';

-- ===== TRIGGER FOR updated_at ON agent_triggers =====

CREATE OR REPLACE FUNCTION update_agent_triggers_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_triggers_updated ON agent_triggers;
CREATE TRIGGER agent_triggers_updated
    BEFORE UPDATE ON agent_triggers
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_triggers_timestamp();
