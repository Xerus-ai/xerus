-- Cleanup users table: remove legacy columns
-- Run this on existing databases to align with clean schema

-- Drop legacy guest-related columns
ALTER TABLE users DROP COLUMN IF EXISTS guest_session_token;
ALTER TABLE users DROP COLUMN IF EXISTS user_type;
ALTER TABLE users DROP COLUMN IF EXISTS session_expires_at;
ALTER TABLE users DROP COLUMN IF EXISTS last_activity;

-- Drop unused columns
ALTER TABLE users DROP COLUMN IF EXISTS email_verified;
ALTER TABLE users DROP COLUMN IF EXISTS phone;
ALTER TABLE users DROP COLUMN IF EXISTS created_by;
ALTER TABLE users DROP COLUMN IF EXISTS updated_by;

-- Drop unused JSONB columns
ALTER TABLE users DROP COLUMN IF EXISTS permissions;
ALTER TABLE users DROP COLUMN IF EXISTS preferences;
ALTER TABLE users DROP COLUMN IF EXISTS metadata;

-- Drop legacy credits_reserved if exists
ALTER TABLE users DROP COLUMN IF EXISTS credits_reserved;

-- Add new columns if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'UTC';

-- Drop legacy indexes
DROP INDEX IF EXISTS users_guest_session_token_key;
DROP INDEX IF EXISTS idx_users_guest_session;
DROP INDEX IF EXISTS idx_users_type;
DROP INDEX IF EXISTS idx_users_last_activity;
DROP INDEX IF EXISTS idx_users_session_expires;

-- Drop legacy constraints (guest-related check)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_type_check;
