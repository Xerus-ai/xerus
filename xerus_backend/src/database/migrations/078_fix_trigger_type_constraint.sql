-- Migration 078: Update execution_sessions trigger_type CHECK constraint
-- The original constraint (migration 022) allowed: manual, scheduled, webhook, event, heartbeat
-- The code now uses: user_message, mention, team, schedule, heartbeat
-- This migration aligns the DB constraint with the TRIGGER_PRIORITIES in execution-lane.types.ts

ALTER TABLE execution_sessions
    DROP CONSTRAINT IF EXISTS execution_sessions_trigger_check;

ALTER TABLE execution_sessions
    ADD CONSTRAINT execution_sessions_trigger_check
    CHECK (trigger_type IS NULL OR trigger_type IN ('user_message', 'mention', 'team', 'schedule', 'heartbeat'));

COMMENT ON COLUMN execution_sessions.trigger_type IS 'user_message, mention, team, schedule, heartbeat';
