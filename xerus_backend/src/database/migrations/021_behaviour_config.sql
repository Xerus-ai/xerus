-- Migration: 011_behaviour_config.sql
-- Description: Behaviour config (thinking_level, autonomy_level) + heartbeat system tables
-- Depends: 004_agents.sql, 001_users.sql

-- ===== 1. ADD BEHAVIOUR COLUMNS TO AGENTS TABLE =====

ALTER TABLE agents ADD COLUMN IF NOT EXISTS thinking_level VARCHAR(20) DEFAULT 'medium' NOT NULL;
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_thinking_level_check;
ALTER TABLE agents ADD CONSTRAINT agents_thinking_level_check
  CHECK (thinking_level IN ('low', 'medium', 'high'));

ALTER TABLE agents ADD COLUMN IF NOT EXISTS autonomy_level VARCHAR(20) DEFAULT 'supervised' NOT NULL;
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_autonomy_level_check;
ALTER TABLE agents ADD CONSTRAINT agents_autonomy_level_check
  CHECK (autonomy_level IN ('supervised', 'semi_autonomous', 'autonomous'));

COMMENT ON COLUMN agents.thinking_level IS 'Reasoning depth: low=1K tokens, medium=8K tokens, high=32K tokens';
COMMENT ON COLUMN agents.autonomy_level IS 'Permission mode: supervised=ask all, semi_autonomous=auto safe, autonomous=full auto';

-- ===== 2. HEARTBEAT CONFIGS (1:1 with agents) =====

CREATE TABLE IF NOT EXISTS heartbeat_configs (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER UNIQUE NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT false NOT NULL,
  cron_expression VARCHAR(100) NOT NULL DEFAULT '0 */30 * * *',
  timezone VARCHAR(50) DEFAULT 'UTC' NOT NULL,
  active_hours_start TIME,
  active_hours_end TIME,
  weekdays_only BOOLEAN DEFAULT false NOT NULL,
  prompt TEXT,
  max_duration_seconds INTEGER DEFAULT 300,
  retry_on_failure BOOLEAN DEFAULT true,
  token_budget INTEGER DEFAULT 8000,
  event_token_budget INTEGER DEFAULT 4000,
  max_alerts_per_hour INTEGER DEFAULT 3,
  suppress_token VARCHAR(50) DEFAULT 'HEARTBEAT_OK',
  tool_allowlist TEXT[],
  default_channel_id INTEGER,
  stagger_offset_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_heartbeat_configs_agent_id ON heartbeat_configs(agent_id);
CREATE INDEX IF NOT EXISTS idx_heartbeat_configs_user_id ON heartbeat_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_heartbeat_configs_enabled ON heartbeat_configs(enabled) WHERE enabled = true;

COMMENT ON TABLE heartbeat_configs IS 'Heartbeat scheduling configuration per agent (1:1 relationship)';
COMMENT ON COLUMN heartbeat_configs.cron_expression IS 'Cron schedule for scheduled heartbeats';
COMMENT ON COLUMN heartbeat_configs.suppress_token IS 'Token that suppresses channel posting (default: HEARTBEAT_OK)';
COMMENT ON COLUMN heartbeat_configs.stagger_offset_ms IS 'Offset in ms to distribute load across agents';

-- ===== 3. HEARTBEAT STATE (runtime state, not config) =====

CREATE TABLE IF NOT EXISTS heartbeat_state (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER UNIQUE NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  last_run_at TIMESTAMPTZ,
  last_outcome VARCHAR(20),
  last_snapshot_hash TEXT,
  consecutive_failures INTEGER DEFAULT 0,
  tokens_spent_today INTEGER DEFAULT 0,
  tokens_budget_today INTEGER DEFAULT 50000,
  last_processed_ids JSONB DEFAULT '{}',
  current_focus TEXT,
  paused_execution_id UUID,
  next_scheduled_at TIMESTAMPTZ,
  suppressed_until TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_heartbeat_state_agent_id ON heartbeat_state(agent_id);
CREATE INDEX IF NOT EXISTS idx_heartbeat_state_next_scheduled ON heartbeat_state(next_scheduled_at);

COMMENT ON TABLE heartbeat_state IS 'Runtime execution state for heartbeat system (separate from config)';
COMMENT ON COLUMN heartbeat_state.last_outcome IS 'success, failure, timeout, suppressed, skipped';
COMMENT ON COLUMN heartbeat_state.last_processed_ids IS 'Deduplication: last processed ID per app (gmail, github, etc.)';

-- ===== 4. SNAPSHOT CONFIGS (for scheduled heartbeats) =====

CREATE TABLE IF NOT EXISTS snapshot_configs (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER UNIQUE NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true,
  run_before_ms INTEGER DEFAULT 300000,
  sources JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshot_configs_agent_id ON snapshot_configs(agent_id);

COMMENT ON TABLE snapshot_configs IS 'Snapshot service configuration per agent (pre-fetch data before scheduled heartbeats)';
COMMENT ON COLUMN snapshot_configs.run_before_ms IS 'How long before scheduled heartbeat to run snapshot (default: 5 min)';
COMMENT ON COLUMN snapshot_configs.sources IS 'Array of snapshot sources: [{app, action, params, format, timeout_ms}]';

-- ===== 5. SNAPSHOT EXECUTIONS (snapshot result history) =====

CREATE TABLE IF NOT EXISTS snapshot_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  sources_fetched INTEGER DEFAULT 0,
  sources_failed INTEGER DEFAULT 0,
  duration_ms INTEGER,
  snapshot_hash TEXT,
  file_path TEXT,
  errors JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshot_executions_agent_id ON snapshot_executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_snapshot_executions_created_at ON snapshot_executions(created_at DESC);

COMMENT ON TABLE snapshot_executions IS 'Snapshot execution history for observability';

-- ===== 6. TRIGGER PROVIDERS (registry of supported trigger sources) =====

CREATE TABLE IF NOT EXISTS trigger_providers (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  adapter_class VARCHAR(100) NOT NULL,
  adapter_config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE trigger_providers IS 'Registry of trigger providers (Pipedream, native webhooks, future: Zapier)';

-- Seed trigger providers
INSERT INTO trigger_providers (slug, display_name, adapter_class) VALUES
  ('schedule', 'Scheduled', 'ScheduleTriggerAdapter'),
  ('pipedream', 'Pipedream Connect', 'PipedreamTriggerAdapter'),
  ('webhook', 'Native Webhooks', 'NativeWebhookAdapter'),
  ('event', 'Internal Events', 'InternalEventAdapter')
ON CONFLICT (slug) DO NOTHING;

-- ===== 7. AGENT TRIGGERS (maps agents to trigger sources) =====

CREATE TABLE IF NOT EXISTS agent_triggers (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  provider_id INTEGER NOT NULL REFERENCES trigger_providers(id),
  app_slug VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  external_id VARCHAR(200),
  webhook_url TEXT,
  filter_config JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  last_fired_at TIMESTAMPTZ,
  fire_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, app_slug, event_type)
);

CREATE INDEX IF NOT EXISTS idx_agent_triggers_agent_id ON agent_triggers(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_triggers_provider_id ON agent_triggers(provider_id);
CREATE INDEX IF NOT EXISTS idx_agent_triggers_lookup ON agent_triggers(app_slug, event_type) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_agent_triggers_external ON agent_triggers(external_id, provider_id) WHERE enabled = true;

COMMENT ON TABLE agent_triggers IS 'Registered event triggers per agent from HEARTBEAT.md Events section';
COMMENT ON COLUMN agent_triggers.app_slug IS 'App identifier: gmail, github, stripe, etc.';
COMMENT ON COLUMN agent_triggers.event_type IS 'Event type: new_email, pr_opened, payment_failed, etc.';
COMMENT ON COLUMN agent_triggers.external_id IS 'Provider-specific identifier for the trigger subscription';

-- ===== 8. HEARTBEAT EXECUTIONS (execution history for all modes) =====

CREATE TABLE IF NOT EXISTS heartbeat_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  heartbeat_config_id INTEGER REFERENCES heartbeat_configs(id) ON DELETE SET NULL,
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  trigger_type VARCHAR(20) NOT NULL,
  trigger_id INTEGER REFERENCES agent_triggers(id) ON DELETE SET NULL,
  event_payload JSONB,
  snapshot_execution_id UUID REFERENCES snapshot_executions(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  outcome VARCHAR(20),
  result JSONB,
  error_message TEXT,
  duration_ms INTEGER,
  tokens_used INTEGER DEFAULT 0,
  tool_calls_count INTEGER DEFAULT 0,
  inbox_posts INTEGER DEFAULT 0,
  memory_updates INTEGER DEFAULT 0,
  alerts_sent INTEGER DEFAULT 0,
  run_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT heartbeat_executions_status_check
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'skipped', 'suppressed')),
  CONSTRAINT heartbeat_executions_outcome_check
    CHECK (outcome IS NULL OR outcome IN ('success', 'failure', 'timeout', 'suppressed', 'skipped')),
  CONSTRAINT heartbeat_executions_trigger_type_check
    CHECK (trigger_type IN ('scheduled', 'event', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_heartbeat_executions_config_id ON heartbeat_executions(heartbeat_config_id);
CREATE INDEX IF NOT EXISTS idx_heartbeat_executions_agent_id ON heartbeat_executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_heartbeat_executions_scheduled_at ON heartbeat_executions(scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_heartbeat_executions_status ON heartbeat_executions(status);
CREATE INDEX IF NOT EXISTS idx_heartbeat_executions_created_at ON heartbeat_executions(agent_id, created_at DESC);

COMMENT ON TABLE heartbeat_executions IS 'Heartbeat execution history for all trigger modes (scheduled, event, manual)';
COMMENT ON COLUMN heartbeat_executions.trigger_type IS 'scheduled=cron, event=webhook trigger, manual=user/API initiated';
COMMENT ON COLUMN heartbeat_executions.run_id IS 'Unique identifier for observability and tracing';

-- ===== 9. UPDATED_AT TRIGGERS =====

-- Reuse the generic update function if it exists, otherwise create it
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_heartbeat_configs_updated_at ON heartbeat_configs;
CREATE TRIGGER set_heartbeat_configs_updated_at
  BEFORE UPDATE ON heartbeat_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_heartbeat_state_updated_at ON heartbeat_state;
CREATE TRIGGER set_heartbeat_state_updated_at
  BEFORE UPDATE ON heartbeat_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_snapshot_configs_updated_at ON snapshot_configs;
CREATE TRIGGER set_snapshot_configs_updated_at
  BEFORE UPDATE ON snapshot_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
