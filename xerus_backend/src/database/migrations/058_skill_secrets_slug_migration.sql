-- Migration 058: Migrate skill_secrets from skill_id to skill_slug
-- The skills table was dropped in migration 055. skill_secrets.skill_id
-- references IDs that no longer exist. Migrate to skill_slug (text).

-- Step 1: Add skill_slug column
ALTER TABLE skill_secrets ADD COLUMN IF NOT EXISTS skill_slug TEXT;

-- Step 2: Drop old constraints that reference skill_id
-- The unique constraint was (user_id, skill_id, env_key)
ALTER TABLE skill_secrets DROP CONSTRAINT IF EXISTS skill_secrets_user_id_skill_id_env_key_key;

-- Step 3: Drop skill_id column (data is unrecoverable since skills table dropped)
ALTER TABLE skill_secrets DROP COLUMN IF EXISTS skill_id;

-- Step 4: Add new unique constraint on (user_id, skill_slug, env_key)
ALTER TABLE skill_secrets ADD CONSTRAINT skill_secrets_user_slug_env_key
    UNIQUE (user_id, skill_slug, env_key);

-- Step 5: Add index for slug lookups
CREATE INDEX IF NOT EXISTS idx_skill_secrets_slug ON skill_secrets (skill_slug);
