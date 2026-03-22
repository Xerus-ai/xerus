-- Migration: 044_tasks.sql
-- Description: Create tasks table for kanban board. Synced from agent workspace (.beads/issues.jsonl) via metadata_sync.
-- Depends: 033_v2_company_hierarchy.sql (channels table)

CREATE TABLE IF NOT EXISTS tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    beads_id        TEXT NOT NULL,
    channel_id      UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id         VARCHAR(255) NOT NULL REFERENCES users(user_id),
    title           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'todo'
                    CHECK (status IN ('todo', 'in_progress', 'done', 'needs_approval')),
    priority        TEXT NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    assigned_agents TEXT[] DEFAULT '{}',
    subtasks        JSONB DEFAULT '[]',
    labels          JSONB DEFAULT '[]',
    start_date      TIMESTAMPTZ,
    due_date        TIMESTAMPTZ,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(channel_id, beads_id)
);

CREATE INDEX idx_tasks_channel ON tasks(channel_id);
CREATE INDEX idx_tasks_user ON tasks(user_id);
CREATE INDEX idx_tasks_status ON tasks(status);

-- updated_at trigger
DROP TRIGGER IF EXISTS set_tasks_updated_at ON tasks;
CREATE TRIGGER set_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE tasks IS 'Kanban tasks synced from agent workspace via metadata_sync or created by humans';
COMMENT ON COLUMN tasks.beads_id IS 'Unique task ID from .beads/issues.jsonl (e.g. task-1709123456789)';
COMMENT ON COLUMN tasks.assigned_agents IS 'Array of agent slugs assigned to this task';
COMMENT ON COLUMN tasks.subtasks IS 'JSON array of {text, done} subtask objects';
COMMENT ON COLUMN tasks.labels IS 'JSON array of {name, color} label objects';
