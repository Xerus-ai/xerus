-- Migration: 005_agent_junctions.sql
-- Description: Create agent junction tables for tools, knowledge bases, and runs
-- Depends: 004_agents.sql

-- ===== AGENT_TOOLS JUNCTION TABLE =====
-- Links agents to their enabled tools (from Connectors API)

CREATE TABLE IF NOT EXISTS agent_tools (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    tool_name VARCHAR(100) NOT NULL,
    tool_config JSONB DEFAULT '{}'::jsonb,
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT agent_tools_unique UNIQUE (agent_id, tool_name)
);

CREATE INDEX IF NOT EXISTS idx_agent_tools_agent ON agent_tools(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tools_name ON agent_tools(tool_name);

COMMENT ON TABLE agent_tools IS 'Junction table linking agents to their enabled tools from Connectors API';

-- ===== AGENT_KNOWLEDGE_BASES JUNCTION TABLE =====
-- Links agents to their assigned knowledge bases (from Mnemosyne)

CREATE TABLE IF NOT EXISTS agent_knowledge_bases (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    knowledge_base_id VARCHAR(255) NOT NULL,
    kb_name VARCHAR(255),
    access_mode VARCHAR(20) DEFAULT 'read',
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT agent_kb_unique UNIQUE (agent_id, knowledge_base_id),
    CONSTRAINT agent_kb_access_mode CHECK (access_mode IN ('read', 'write', 'admin'))
);

CREATE INDEX IF NOT EXISTS idx_agent_kb_agent ON agent_knowledge_bases(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_kb_kb ON agent_knowledge_bases(knowledge_base_id);

COMMENT ON TABLE agent_knowledge_bases IS 'Junction table linking agents to Mnemosyne knowledge bases';

-- ===== AGENT_RUNS TABLE =====
-- Execution history for success_rate calculation and audit trail

CREATE TABLE IF NOT EXISTS agent_runs (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
    user_id VARCHAR(255) REFERENCES users(user_id) ON DELETE SET NULL,

    -- Execution details
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,

    -- Input/Output
    input_message TEXT,
    output_message TEXT,

    -- Metrics
    tokens_used INTEGER DEFAULT 0,
    tool_calls_count INTEGER DEFAULT 0,
    kb_queries_count INTEGER DEFAULT 0,

    -- Error tracking
    error_code VARCHAR(50),
    error_message TEXT,

    -- Context
    execution_context JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT agent_runs_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_user ON agent_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_started ON agent_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_status ON agent_runs(agent_id, status);

COMMENT ON TABLE agent_runs IS 'Agent execution history for analytics and success_rate calculation';

-- ===== TRIGGER FOR success_rate UPDATE =====
-- Update agent success_rate after each run completion

CREATE OR REPLACE FUNCTION update_agent_success_rate()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update on status change to completed or failed
  IF NEW.status IN ('completed', 'failed') AND NEW.agent_id IS NOT NULL THEN
    UPDATE agents SET
      success_rate = (
        SELECT COALESCE(
          AVG(CASE WHEN status = 'completed' THEN 1.0 ELSE 0.0 END)::DECIMAL(5,4),
          0.0000
        )
        FROM agent_runs
        WHERE agent_id = NEW.agent_id AND status IN ('completed', 'failed')
      ),
      execution_count = execution_count + 1,
      last_used_at = NOW()
    WHERE id = NEW.agent_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_runs_update_success_rate ON agent_runs;
CREATE TRIGGER agent_runs_update_success_rate
  AFTER INSERT OR UPDATE OF status ON agent_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_success_rate();

COMMENT ON FUNCTION update_agent_success_rate IS 'Updates agent success_rate, execution_count, and last_used_at after run completion';
