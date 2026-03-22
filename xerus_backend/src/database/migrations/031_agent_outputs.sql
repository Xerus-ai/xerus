-- Migration: 030_agent_outputs.sql
-- Description: Create agent_outputs table for task-anchored output organization
-- Task: glass-y5v.4.84
-- Depends: 022_execution_domain.sql (user_workspaces), 004_agents.sql

-- ===== AGENT_OUTPUTS TABLE =====
-- Cross-cutting index for querying outputs by date, content type, across agents.
-- Each row represents one output file registered in a workspace.

CREATE TABLE IF NOT EXISTS agent_outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES user_workspaces(id) ON DELETE CASCADE,
    task_slug VARCHAR(64) NOT NULL,
    step_number INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    content_type VARCHAR(20) NOT NULL DEFAULT 'other',
    size_bytes BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    CONSTRAINT agent_outputs_step_check CHECK (step_number >= 1),
    CONSTRAINT agent_outputs_size_check CHECK (size_bytes >= 0),
    CONSTRAINT agent_outputs_content_type_check CHECK (content_type IN (
        'text', 'json', 'markdown', 'code', 'image', 'csv', 'html', 'other'
    )),
    CONSTRAINT agent_outputs_unique_path UNIQUE (workspace_id, file_path)
);

-- Query by workspace + task
CREATE INDEX IF NOT EXISTS idx_agent_outputs_workspace_task
    ON agent_outputs(workspace_id, task_slug);

-- Query by agent
CREATE INDEX IF NOT EXISTS idx_agent_outputs_agent_id
    ON agent_outputs(agent_id);

-- Query by date (recent outputs)
CREATE INDEX IF NOT EXISTS idx_agent_outputs_created
    ON agent_outputs(created_at DESC);

-- Query by content type within workspace
CREATE INDEX IF NOT EXISTS idx_agent_outputs_content_type
    ON agent_outputs(workspace_id, content_type);

COMMENT ON TABLE agent_outputs IS 'Cross-cutting index for agent output files';
COMMENT ON COLUMN agent_outputs.task_slug IS 'Kebab-case slug from inbox_item title';
COMMENT ON COLUMN agent_outputs.step_number IS 'Auto-incremented step within task';
COMMENT ON COLUMN agent_outputs.file_path IS 'Relative path within workspace (outputs/{task-slug}/step-NNN-desc.md)';
COMMENT ON COLUMN agent_outputs.content_type IS 'text, json, markdown, code, image, csv, html, other';
