-- Migration: 008_tools_pipedream.sql
-- Description: Pipedream Connect tools integration - clean implementation
-- Depends: 004_agents.sql, 005_agent_junctions.sql
-- Replaces: Legacy Connectors tables with Pipedream Connect

-- ===== CLEANUP: Remove Connectors Legacy Tables =====

-- Drop unused tables
DROP TABLE IF EXISTS tool_configurations CASCADE;
DROP TABLE IF EXISTS mcp_tool_manifests CASCADE;

-- Drop Connectors legacy tables (replaced by Pipedream)
DROP TABLE IF EXISTS agent_tools CASCADE;
DROP TABLE IF EXISTS tool_executions CASCADE;

-- ===== CONNECTED_ACCOUNTS TABLE =====
-- Tracks user OAuth connections managed by Pipedream
-- Credentials stored securely in Pipedream, we only store metadata

CREATE TABLE IF NOT EXISTS connected_accounts (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    app_slug VARCHAR(100) NOT NULL,
    app_name VARCHAR(255) NOT NULL,
    pipedream_account_id VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_connected_accounts_user ON connected_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_app ON connected_accounts(app_slug);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_pipedream ON connected_accounts(pipedream_account_id);

COMMENT ON TABLE connected_accounts IS 'User OAuth connections managed by Pipedream Connect';
COMMENT ON COLUMN connected_accounts.pipedream_account_id IS 'Pipedream account ID for credential management';
COMMENT ON COLUMN connected_accounts.app_slug IS 'App identifier (gmail, slack, github, etc)';

-- ===== AGENT_TOOLS TABLE =====
-- Links agents to apps they can use (not specific actions)
-- Users assign apps to agents, Pipedream semantically selects actions at runtime

CREATE TABLE IF NOT EXISTS agent_tools (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    app_slug VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    CONSTRAINT agent_tools_unique UNIQUE (agent_id, app_slug)
);

CREATE INDEX IF NOT EXISTS idx_agent_tools_agent ON agent_tools(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tools_app ON agent_tools(app_slug);

COMMENT ON TABLE agent_tools IS 'Apps assigned to agents (Pipedream Connect)';
COMMENT ON COLUMN agent_tools.app_slug IS 'App identifier (gmail, slack, github) - agent can use any action from this app';

-- ===== TOOL_EXECUTIONS TABLE =====
-- Execution history for tool usage analytics and debugging
-- Links to agent_runs for execution context

CREATE TABLE IF NOT EXISTS tool_executions (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
    run_id INTEGER REFERENCES agent_runs(id) ON DELETE SET NULL,
    app_slug VARCHAR(100) NOT NULL,
    action_key VARCHAR(255) NOT NULL,
    input JSONB,
    output JSONB,
    success BOOLEAN NOT NULL,
    error TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tool_executions_agent ON tool_executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_tool_executions_run ON tool_executions(run_id);
CREATE INDEX IF NOT EXISTS idx_tool_executions_app ON tool_executions(app_slug);
CREATE INDEX IF NOT EXISTS idx_tool_executions_created ON tool_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_executions_success ON tool_executions(success);

COMMENT ON TABLE tool_executions IS 'Tool execution history for Pipedream Connect actions';
COMMENT ON COLUMN tool_executions.action_key IS 'Pipedream action key (e.g., gmail-send-email)';
COMMENT ON COLUMN tool_executions.run_id IS 'Links to agent_runs for execution context';
