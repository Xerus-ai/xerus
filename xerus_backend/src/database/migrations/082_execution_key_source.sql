-- Migration: 082_execution_key_source.sql
-- Description: Add key_source column to execution_sessions for billing type tracking
-- Part of CLI-native pivot integration

-- Add key_source column to track whether execution used BYOK or platform API key
ALTER TABLE execution_sessions
    ADD COLUMN IF NOT EXISTS key_source VARCHAR(10);

-- Add check constraint for valid values
ALTER TABLE execution_sessions
    DROP CONSTRAINT IF EXISTS execution_sessions_key_source_check;

ALTER TABLE execution_sessions
    ADD CONSTRAINT execution_sessions_key_source_check
    CHECK (key_source IS NULL OR key_source IN ('byok', 'platform'));

CREATE INDEX IF NOT EXISTS idx_execution_sessions_key_source
    ON execution_sessions(key_source)
    WHERE key_source IS NOT NULL;

COMMENT ON COLUMN execution_sessions.key_source IS 'byok = user BYOK key, platform = platform API key';
