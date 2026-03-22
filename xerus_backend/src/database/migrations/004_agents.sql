-- Migration: 004_agents.sql
-- Description: Create agents table with 21-field schema
-- Depends: 001_users.sql

-- Create agent_type enum check via constraint
-- Values: internal (hidden platform infrastructure), public (templates + marketplace), private (user-owned)

CREATE TABLE IF NOT EXISTS agents (
    -- ===== IDENTITY (5 fields) =====
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    personality_type VARCHAR(100) DEFAULT NULL,
    avatar_url TEXT,

    -- ===== PROMPTS & CAPABILITIES (2 fields) =====
    system_prompt JSONB NOT NULL DEFAULT '{
      "identity": {"name": "", "role": "", "purpose": ""},
      "goals": {"primary": "", "success_criteria": []},
      "capabilities": {"tools": [], "knowledge_base": [], "skills": []},
      "guidelines": [],
      "constraints": [],
      "personality": {"style": "professional", "tone": "neutral"}
    }'::jsonb,

    capabilities JSONB DEFAULT '{
      "tools": [],
      "skills": [],
      "permissions": {
        "can_write_files": false,
        "can_send_emails": false,
        "can_create_tasks": false
      },
      "constraints": {
        "max_concurrent_tools": 3,
        "timeout_seconds": 120
      },
      "model_config": {},
      "style": {}
    }'::jsonb,

    -- ===== MODEL (1 field) =====
    ai_model VARCHAR(50) DEFAULT 'gpt-4o',

    -- ===== OWNERSHIP & VISIBILITY (2 fields) =====
    user_id VARCHAR(255) REFERENCES users(user_id) ON DELETE CASCADE,
    agent_type VARCHAR(20) NOT NULL DEFAULT 'private',

    -- ===== MARKETPLACE (4 fields) =====
    is_verified BOOLEAN DEFAULT false,
    clone_count INTEGER DEFAULT 0,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    public_metadata JSONB DEFAULT NULL,

    -- ===== CLONE TRACKING (1 field) =====
    source_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,

    -- ===== EXECUTION CONFIGURATION (1 field) =====
    workflow_config JSONB DEFAULT '{
      "executionMode": "simple",
      "coordinationMode": "sequential",
      "workflowStrategy": null,
      "selectedTemplateId": null,
      "workflowSteps": [],
      "teamAgents": [],
      "teamId": null,
      "isMultiAgent": false
    }'::jsonb,

    -- ===== STATUS & ANALYTICS (4 fields) =====
    is_default BOOLEAN DEFAULT false,
    execution_count INTEGER DEFAULT 0,
    success_rate DECIMAL(5,4) DEFAULT 0.0000,
    last_used_at TIMESTAMPTZ DEFAULT NULL,

    -- ===== TIMESTAMPS (2 fields) =====
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- ===== CONSTRAINTS =====
    CONSTRAINT agents_type_check CHECK (agent_type IN ('internal', 'public', 'private')),
    CONSTRAINT agents_success_rate_check CHECK (success_rate >= 0 AND success_rate <= 1)
);

-- ===== INDEXES =====

-- User agents lookup
CREATE INDEX IF NOT EXISTS idx_agents_user ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(agent_type);

-- Marketplace browsing (excludes internal agents)
CREATE INDEX IF NOT EXISTS idx_agents_public ON agents(agent_type) WHERE agent_type = 'public';
CREATE INDEX IF NOT EXISTS idx_agents_internal ON agents(agent_type) WHERE agent_type = 'internal';
CREATE INDEX IF NOT EXISTS idx_agents_verified ON agents(is_verified) WHERE is_verified = true;
CREATE INDEX IF NOT EXISTS idx_agents_clone_count ON agents(clone_count DESC);
CREATE INDEX IF NOT EXISTS idx_agents_tags ON agents USING GIN (tags);

-- Clone lineage tracking
CREATE INDEX IF NOT EXISTS idx_agents_source ON agents(source_agent_id);

-- Recent usage sorting
CREATE INDEX IF NOT EXISTS idx_agents_last_used ON agents(last_used_at DESC NULLS LAST);

-- Name lookup (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(LOWER(name));

-- ===== UNIQUE CONSTRAINTS =====

-- Unique name per user (private agents)
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_unique_name_per_user
  ON agents(user_id, LOWER(name))
  WHERE agent_type = 'private' AND user_id IS NOT NULL;

-- Unique name for public agents (templates + marketplace)
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_unique_public_name
  ON agents(LOWER(name))
  WHERE agent_type = 'public';

-- Unique name for internal agents
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_unique_internal_name
  ON agents(LOWER(name))
  WHERE agent_type = 'internal';

-- Only one default private agent per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_one_default_per_user
  ON agents(user_id)
  WHERE is_default = true AND agent_type = 'private';

-- Only one default public template globally (the featured template)
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_one_default_template
  ON agents(agent_type)
  WHERE is_default = true AND agent_type = 'public' AND user_id IS NULL;

-- ===== TRIGGER FOR updated_at =====

CREATE OR REPLACE FUNCTION update_agents_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agents_updated_at ON agents;
CREATE TRIGGER agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION update_agents_timestamp();

-- ===== COMMENTS =====

COMMENT ON TABLE agents IS 'Agent definitions with 21-field schema for lifecycle management';
COMMENT ON COLUMN agents.agent_type IS 'internal=hidden platform infrastructure, public=templates+marketplace, private=user-owned';
COMMENT ON COLUMN agents.system_prompt IS '6-section structured prompt: identity, goals, capabilities, guidelines, constraints, personality';
COMMENT ON COLUMN agents.capabilities IS 'Tools, skills, permissions, constraints, model_config, style';
COMMENT ON COLUMN agents.workflow_config IS 'Execution routing: executionMode, coordinationMode, workflowStrategy';
COMMENT ON COLUMN agents.success_rate IS 'Ratio of successful executions (0.0000-1.0000), updated by trigger after runs';
