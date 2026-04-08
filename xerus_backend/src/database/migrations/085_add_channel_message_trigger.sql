-- Add 'channel_message' to execution_sessions trigger_type CHECK constraint
-- Required for channel message → agent execution flow

ALTER TABLE execution_sessions
    DROP CONSTRAINT IF EXISTS execution_sessions_trigger_check;

ALTER TABLE execution_sessions
    ADD CONSTRAINT execution_sessions_trigger_check
    CHECK (trigger_type IS NULL OR trigger_type IN ('user_message', 'channel_message', 'mention', 'team', 'schedule', 'heartbeat'));

COMMENT ON COLUMN execution_sessions.trigger_type IS 'user_message, channel_message, mention, team, schedule, heartbeat';
