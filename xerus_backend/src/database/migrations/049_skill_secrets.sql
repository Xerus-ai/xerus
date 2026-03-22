-- Skill Secrets: per-user encrypted env vars for skills that need API keys
-- Each row stores one encrypted key-value pair scoped to (user, skill)

CREATE TABLE IF NOT EXISTS skill_secrets (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    env_key TEXT NOT NULL,
    encrypted_value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, skill_id, env_key)
);

-- Fast lookup: all secrets for a user+skill pair (used during execution)
CREATE INDEX IF NOT EXISTS idx_skill_secrets_user_skill ON skill_secrets(user_id, skill_id);

-- Fast lookup: all secrets for a user (used for bulk resolution at runtime)
CREATE INDEX IF NOT EXISTS idx_skill_secrets_user ON skill_secrets(user_id);

-- Cascade cleanup: when a skill is deleted, secrets are removed via FK ON DELETE CASCADE
-- Cascade cleanup: when a skill is uninstalled, secrets are cleaned up by the service layer
