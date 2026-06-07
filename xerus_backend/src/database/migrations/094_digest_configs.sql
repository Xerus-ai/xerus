-- Migration 094: Create digest_configs table
-- Stores per-user digest schedule preferences (standup + report cron schedules)

CREATE TABLE IF NOT EXISTS digest_configs (
    user_id         TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    enabled         BOOLEAN NOT NULL DEFAULT true,
    standup_cron    TEXT NOT NULL DEFAULT '0 9 * * 1-5',
    report_cron     TEXT NOT NULL DEFAULT '0 17 * * 1-5',
    timezone        TEXT NOT NULL DEFAULT 'UTC',
    skip_on_no_activity BOOLEAN NOT NULL DEFAULT true,
    xerus_agent_slug    TEXT NOT NULL DEFAULT 'xerus-master',
    default_channel_id  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_digest_configs_enabled ON digest_configs (enabled) WHERE enabled = true;
