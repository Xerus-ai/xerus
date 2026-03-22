-- Migration 042: BYOK Phase 1 - Clean Slate
-- Replaces plan types (free/pro/enterprise -> free/starter/advanced/prodigy)
-- Adds platform_key_access column for per-user cost control
-- Drops dead columns from provisioner era

-- 1. Drop old plan_type CHECK constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_type_check;

-- 2. Migrate existing users from 'free' to 'starter' with new credit balance
UPDATE users SET plan_type = 'starter', credits_available = 2500 WHERE plan_type = 'free';

-- 3. Add new plan_type CHECK constraint
ALTER TABLE users ADD CONSTRAINT users_plan_type_check
    CHECK (plan_type IN ('free', 'starter', 'advanced', 'prodigy'));

-- 4. Update defaults
ALTER TABLE users ALTER COLUMN plan_type SET DEFAULT 'starter';
ALTER TABLE users ALTER COLUMN credits_available SET DEFAULT 2500;

-- 5. Add platform_key_access: per-user flag to control platform key usage
-- true = user can use Xerus's platform OpenRouter key (credits deducted)
-- false = user must provide their own key (BYOK) or execution throws
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_key_access BOOLEAN NOT NULL DEFAULT true;

-- 6. Drop dead columns
ALTER TABLE users DROP COLUMN IF EXISTS credits_reserved;
ALTER TABLE users DROP COLUMN IF EXISTS klavis_strata_id;
ALTER TABLE users DROP COLUMN IF EXISTS klavis_strata_url;

-- 7. Clean up old provider keys (mnemosyne, connectors)
DELETE FROM user_api_keys WHERE provider NOT IN ('openrouter', 'daytona');
