-- 070: Add thinking and message_metadata columns to execution_sessions
-- Enables rich history reload (reasoning text + structured tool call data)

ALTER TABLE execution_sessions
    ADD COLUMN IF NOT EXISTS thinking TEXT,
    ADD COLUMN IF NOT EXISTS message_metadata JSONB;

COMMENT ON COLUMN execution_sessions.thinking IS 'Accumulated reasoning text from agent session';
COMMENT ON COLUMN execution_sessions.message_metadata IS 'Structured data: tool_calls array for rich history reload';
