-- AGENT USER ISOLATION MIGRATION
-- Adds user_id and agent_type to agents table for privacy and data separation
-- Run this migration to separate system agents from user-created agents

-- ============================================================================
-- ADD USER ISOLATION COLUMNS TO AGENTS TABLE
-- ============================================================================

-- Add user_id column (nullable for system agents)
ALTER TABLE agents ADD COLUMN user_id VARCHAR(255);

-- Add agent_type column to distinguish system vs user agents
ALTER TABLE agents ADD COLUMN agent_type VARCHAR(20) DEFAULT 'system' 
    CHECK (agent_type IN ('system', 'user', 'shared'));

-- Add creator information for audit trail
ALTER TABLE agents ADD COLUMN created_by VARCHAR(255);

-- ============================================================================
-- UPDATE EXISTING AGENTS TO BE SYSTEM AGENTS
-- ============================================================================

-- Mark all existing agents as system agents (available to all users)
UPDATE agents 
SET agent_type = 'system', 
    created_by = 'system',
    user_id = NULL  -- System agents don't belong to specific users
WHERE agent_type IS NULL;

-- ============================================================================
-- CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for user-specific agent queries
CREATE INDEX IF NOT EXISTS idx_agents_user_id 
ON agents(user_id, agent_type, is_active);

-- Index for agent type filtering
CREATE INDEX IF NOT EXISTS idx_agents_type_active 
ON agents(agent_type, is_active, created_at DESC);

-- Index for personality type and user combination
CREATE INDEX IF NOT EXISTS idx_agents_personality_user 
ON agents(personality_type, user_id, is_active);

-- ============================================================================
-- CREATE VIEW FOR USER-ACCESSIBLE AGENTS
-- ============================================================================

-- View that shows agents accessible to a specific user
-- Includes both system agents and user's own agents
CREATE OR REPLACE VIEW user_accessible_agents AS
SELECT 
    a.*,
    CASE 
        WHEN a.agent_type = 'system' THEN 'System Agent'
        WHEN a.agent_type = 'user' THEN 'My Agent'
        WHEN a.agent_type = 'shared' THEN 'Shared Agent'
        ELSE 'Unknown'
    END as agent_source,
    CASE 
        WHEN a.agent_type = 'system' THEN true
        WHEN a.agent_type = 'user' THEN true  -- Will be filtered by user_id in queries
        WHEN a.agent_type = 'shared' THEN true
        ELSE false
    END as is_accessible
FROM agents a
WHERE a.is_active = true;

-- ============================================================================
-- AGENT PRIVACY FUNCTIONS
-- ============================================================================

-- Function to get agents accessible to a specific user
CREATE OR REPLACE FUNCTION get_user_agents(p_user_id VARCHAR(255))
RETURNS TABLE(
    id INTEGER,
    name VARCHAR(100),
    personality_type VARCHAR(50),
    description TEXT,
    system_prompt TEXT,
    capabilities TEXT,
    response_style TEXT,
    is_active BOOLEAN,
    ai_model VARCHAR(50),
    model_preferences TEXT,
    web_search_enabled BOOLEAN,
    search_all_knowledge BOOLEAN,
    usage_count INTEGER,
    is_default BOOLEAN,
    agent_type VARCHAR(20),
    user_id VARCHAR(255),
    created_by VARCHAR(255),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    agent_source TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id,
        a.name,
        a.personality_type,
        a.description,
        a.system_prompt,
        a.capabilities,
        a.response_style,
        a.is_active,
        a.ai_model,
        a.model_preferences,
        a.web_search_enabled,
        a.search_all_knowledge,
        a.usage_count,
        a.is_default,
        a.agent_type,
        a.user_id,
        a.created_by,
        a.created_at,
        a.updated_at,
        CASE 
            WHEN a.agent_type = 'system' THEN 'System Agent'::text
            WHEN a.agent_type = 'user' AND a.user_id = p_user_id THEN 'My Agent'::text
            WHEN a.agent_type = 'shared' THEN 'Shared Agent'::text
            ELSE 'Unknown'::text
        END
    FROM agents a
    WHERE a.is_active = true 
      AND (
          a.agent_type = 'system'  -- System agents available to everyone
          OR (a.agent_type = 'user' AND a.user_id = p_user_id)  -- User's own agents
          OR a.agent_type = 'shared'  -- Shared agents available to everyone
      )
    ORDER BY 
        CASE WHEN a.is_default THEN 0 ELSE 1 END,  -- Default agents first
        a.usage_count DESC,
        a.name ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user can access specific agent
CREATE OR REPLACE FUNCTION can_user_access_agent(p_user_id VARCHAR(255), p_agent_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    agent_record RECORD;
BEGIN
    SELECT agent_type, user_id INTO agent_record
    FROM agents 
    WHERE id = p_agent_id AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- System and shared agents are accessible to everyone
    IF agent_record.agent_type IN ('system', 'shared') THEN
        RETURN true;
    END IF;
    
    -- User agents are only accessible to their creator
    IF agent_record.agent_type = 'user' AND agent_record.user_id = p_user_id THEN
        RETURN true;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- AUDIT TABLE FOR AGENT ACCESS
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_access_log (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'view', 'execute', 'create', 'update', 'delete'
    access_granted BOOLEAN NOT NULL,
    denial_reason VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_access_log_user
ON agent_access_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_access_log_agent
ON agent_access_log(agent_id, created_at DESC);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN agents.user_id IS 'User who owns this agent. NULL for system agents available to all users.';
COMMENT ON COLUMN agents.agent_type IS 'Type of agent: system (built-in), user (private), shared (community)';
COMMENT ON COLUMN agents.created_by IS 'User or system that created this agent';

COMMENT ON FUNCTION get_user_agents(VARCHAR) IS 'Returns all agents accessible to a specific user (system + user-owned + shared)';
COMMENT ON FUNCTION can_user_access_agent(VARCHAR, INTEGER) IS 'Checks if a user can access a specific agent';

COMMENT ON TABLE agent_access_log IS 'Audit log for agent access and operations for security monitoring';

-- End of Agent User Isolation Migration