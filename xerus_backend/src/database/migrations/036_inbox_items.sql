-- Migration 036: Inbox items for execution deliverables
-- Stores inbox items created by agent executions (heartbeats, tasks, teams)

CREATE TABLE IF NOT EXISTS inbox_items (
    item_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id),
    channel_id TEXT,
    agent_id INTEGER REFERENCES agents(id),
    team_id TEXT,
    conversation_id TEXT,
    schedule_id TEXT,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL DEFAULT 'deliverable',
    status TEXT NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress','delivered','approved','rejected','archived')),
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    is_read BOOLEAN NOT NULL DEFAULT false,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('low','normal','high','critical')),
    due_date TIMESTAMPTZ,
    revision_number INTEGER NOT NULL DEFAULT 1,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

CREATE INDEX idx_inbox_items_user ON inbox_items(user_id);
CREATE INDEX idx_inbox_items_channel ON inbox_items(channel_id);
CREATE INDEX idx_inbox_items_status ON inbox_items(user_id, status);
