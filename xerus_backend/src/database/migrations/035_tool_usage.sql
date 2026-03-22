-- Migration 035: Tool usage tracking for credit billing
-- Records per-tool token consumption and credit charges per execution session

CREATE TABLE IF NOT EXISTS tool_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id),
    agent_id INTEGER REFERENCES agents(id),
    session_id TEXT,
    tool_name TEXT NOT NULL,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    credits_consumed NUMERIC(10,4) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tool_usage_session ON tool_usage(session_id);
CREATE INDEX idx_tool_usage_user ON tool_usage(user_id);
