-- Migration: 040_conversations.sql
-- Description: Drop stale chat tables, create conversations table, add message content to execution_sessions
-- Depends: 022_execution_domain.sql

-- ===== 1. DROP STALE TABLES =====
-- Old frontend-only tables with no backend code using them.
-- messages has FK to conversations, so drop it first.

DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;

-- ===== 2. CONVERSATIONS TABLE =====
-- Execution-linked conversation for chat sidebar.
-- Each conversation groups multiple execution_sessions (user/assistant message pairs).

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL DEFAULT 'New conversation',
    sdk_session_id VARCHAR(255),
    summary TEXT,
    message_count INTEGER DEFAULT 0 NOT NULL,
    last_message_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_conversations_user_last_msg ON conversations(user_id, last_message_at DESC);
CREATE INDEX idx_conversations_agent_id ON conversations(agent_id);

COMMENT ON TABLE conversations IS 'Chat conversations linking user messages to execution sessions';
COMMENT ON COLUMN conversations.sdk_session_id IS 'Claude SDK session ID for resume (bonus, not required)';
COMMENT ON COLUMN conversations.summary IS 'Auto-generated conversation summary for sidebar preview';

-- ===== 3. ALTER EXECUTION_SESSIONS =====
-- Add conversation link + message content storage.
-- user_prompt and agent_response store the actual message text.

ALTER TABLE execution_sessions
    ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS user_prompt TEXT,
    ADD COLUMN IF NOT EXISTS agent_response TEXT;

CREATE INDEX idx_exec_sessions_conversation ON execution_sessions(conversation_id, created_at);
