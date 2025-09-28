-- XERUS 4-TYPE AGENT MEMORY SYSTEM DATABASE SCHEMA
-- Creates tables for Working, Episodic, Semantic, and Procedural memory types
-- Supports agent-agnostic memory with dynamic pattern discovery

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- WORKING MEMORY TABLE
-- Sliding window context with attention sinks and auto-expiration
-- ============================================================================

CREATE TABLE IF NOT EXISTS working_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id INTEGER NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  content JSONB NOT NULL,
  context_type VARCHAR(50) DEFAULT 'text', -- text, screenshot, audio, tool_result
  relevance_score DECIMAL(3,2) DEFAULT 0.5,
  attention_sink BOOLEAN DEFAULT false,
  token_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  
  -- Indexes
  CONSTRAINT working_memory_agent_user_idx UNIQUE (id, agent_id, user_id)
);

-- ============================================================================
-- EPISODIC MEMORY TABLE
-- Session-specific memories and interaction events
-- ============================================================================

CREATE TABLE IF NOT EXISTS episodic_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id INTEGER NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  episode_type VARCHAR(50) DEFAULT 'conversation', -- conversation, task, error, success, learning, discovery
  content JSONB NOT NULL,
  context JSONB,
  outcome VARCHAR(50),
  user_satisfaction DECIMAL(3,2),
  importance_score DECIMAL(3,2) DEFAULT 0.5,
  session_duration INTEGER, -- seconds
  promoted_to_semantic BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes for efficient querying
  CONSTRAINT episodic_memory_agent_user_idx UNIQUE (id, agent_id, user_id)
);

-- ============================================================================
-- SEMANTIC MEMORY TABLE
-- Long-term factual knowledge with RAG integration
-- ============================================================================

CREATE TABLE IF NOT EXISTS semantic_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id INTEGER NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  content JSONB NOT NULL,
  knowledge_type VARCHAR(50) DEFAULT 'general', -- general, domain, personal, procedural
  embedding VECTOR(1536), -- OpenAI embedding dimension
  confidence_score DECIMAL(3,2) DEFAULT 0.5,
  source_type VARCHAR(50), -- episodic_promotion, user_input, rag_integration, discovery
  source_id UUID, -- Reference to source (if promoted from episodic)
  usage_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes for vector similarity search
  CONSTRAINT semantic_memory_agent_user_idx UNIQUE (id, agent_id, user_id)
);

-- ============================================================================
-- PROCEDURAL MEMORY TABLE
-- Learned behaviors, patterns, and procedures
-- ============================================================================

CREATE TABLE IF NOT EXISTS procedural_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id INTEGER NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  procedure_name VARCHAR(255) NOT NULL,
  procedure_type VARCHAR(50) DEFAULT 'behavior', -- behavior, pattern, workflow, response
  procedure_data JSONB NOT NULL,
  context_conditions JSONB, -- When this procedure applies
  success_rate DECIMAL(3,2) DEFAULT 0.5,
  usage_count INTEGER DEFAULT 0,
  adaptation_history JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes for pattern matching
  CONSTRAINT procedural_memory_agent_user_idx UNIQUE (id, agent_id, user_id),
  CONSTRAINT procedural_name_unique UNIQUE (agent_id, user_id, procedure_name)
);

-- ============================================================================
-- DISCOVERED PATTERNS TABLE
-- Cross-memory pattern discovery results
-- ============================================================================

CREATE TABLE IF NOT EXISTS discovered_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_key VARCHAR(512) NOT NULL, -- agentId:userId
  pattern_type VARCHAR(50) NOT NULL, -- temporal, contextual, behavioral, semantic
  pattern_name VARCHAR(255) NOT NULL,
  pattern_data JSONB NOT NULL,
  confidence_score DECIMAL(3,2) DEFAULT 0.5,
  occurrences INTEGER DEFAULT 1,
  memory_types VARCHAR(100), -- which memory types contributed: working,episodic,semantic,procedural
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Unique patterns per instance
  CONSTRAINT discovered_patterns_unique UNIQUE (instance_key, pattern_type, pattern_name)
);

-- ============================================================================
-- MEMORY EVOLUTION HISTORY TABLE
-- Track memory system evolution and improvements
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory_evolution_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_key VARCHAR(512) NOT NULL, -- agentId:userId
  evolution_type VARCHAR(50) NOT NULL, -- strategy_mutation, performance_optimization, pattern_adaptation
  change_description TEXT,
  old_config JSONB,
  new_config JSONB,
  performance_before JSONB,
  performance_after JSONB,
  success BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Working Memory Indexes
CREATE INDEX IF NOT EXISTS idx_working_memory_agent_user 
ON working_memory(agent_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_working_memory_session 
ON working_memory(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_working_memory_expires 
ON working_memory(expires_at);

CREATE INDEX IF NOT EXISTS idx_working_memory_attention_sinks 
ON working_memory(agent_id, user_id, attention_sink, relevance_score DESC) WHERE attention_sink = true;

-- Episodic Memory Indexes
CREATE INDEX IF NOT EXISTS idx_episodic_memory_agent_user 
ON episodic_memory(agent_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_episodic_memory_session 
ON episodic_memory(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_episodic_memory_type 
ON episodic_memory(episode_type, importance_score DESC);

CREATE INDEX IF NOT EXISTS idx_episodic_memory_promotion 
ON episodic_memory(agent_id, user_id, importance_score DESC) WHERE promoted_to_semantic = false;

-- Semantic Memory Indexes
CREATE INDEX IF NOT EXISTS idx_semantic_memory_agent_user 
ON semantic_memory(agent_id, user_id, last_accessed DESC);

CREATE INDEX IF NOT EXISTS idx_semantic_memory_type 
ON semantic_memory(knowledge_type, confidence_score DESC);

CREATE INDEX IF NOT EXISTS idx_semantic_memory_usage 
ON semantic_memory(usage_count DESC, last_accessed DESC);

-- Vector similarity index (using pgvector)
CREATE INDEX IF NOT EXISTS idx_semantic_memory_embedding 
ON semantic_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Procedural Memory Indexes
CREATE INDEX IF NOT EXISTS idx_procedural_memory_agent_user 
ON procedural_memory(agent_id, user_id, last_used DESC);

CREATE INDEX IF NOT EXISTS idx_procedural_memory_type 
ON procedural_memory(procedure_type, success_rate DESC);

CREATE INDEX IF NOT EXISTS idx_procedural_memory_usage 
ON procedural_memory(usage_count DESC, success_rate DESC) WHERE is_active = true;

-- Pattern Discovery Indexes
CREATE INDEX IF NOT EXISTS idx_discovered_patterns_instance 
ON discovered_patterns(instance_key, pattern_type, confidence_score DESC);

CREATE INDEX IF NOT EXISTS idx_discovered_patterns_occurrence 
ON discovered_patterns(occurrences DESC, confidence_score DESC);

-- Evolution History Indexes
CREATE INDEX IF NOT EXISTS idx_evolution_history_instance 
ON memory_evolution_history(instance_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_evolution_history_type 
ON memory_evolution_history(evolution_type, created_at DESC);

-- ============================================================================
-- MAINTENANCE FUNCTIONS
-- ============================================================================

-- Function to clean up expired working memories
CREATE OR REPLACE FUNCTION cleanup_expired_working_memory()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM working_memory WHERE expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update semantic memory usage counts
CREATE OR REPLACE FUNCTION update_semantic_memory_usage(p_agent_id INTEGER, p_user_id VARCHAR(255), p_memory_ids UUID[])
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE semantic_memory 
    SET 
        usage_count = usage_count + 1,
        last_accessed = CURRENT_TIMESTAMP
    WHERE agent_id = p_agent_id 
      AND user_id = p_user_id 
      AND id = ANY(p_memory_ids);
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update procedural memory success rates
CREATE OR REPLACE FUNCTION update_procedural_success(p_id UUID, p_success BOOLEAN)
RETURNS VOID AS $$
DECLARE
    current_rate DECIMAL(3,2);
    current_count INTEGER;
    new_rate DECIMAL(3,2);
BEGIN
    SELECT success_rate, usage_count INTO current_rate, current_count
    FROM procedural_memory WHERE id = p_id;
    
    -- Calculate new success rate using exponential moving average
    IF current_count = 0 THEN
        new_rate := CASE WHEN p_success THEN 1.0 ELSE 0.0 END;
    ELSE
        new_rate := current_rate * 0.9 + (CASE WHEN p_success THEN 1.0 ELSE 0.0 END) * 0.1;
    END IF;
    
    UPDATE procedural_memory 
    SET 
        success_rate = new_rate,
        usage_count = usage_count + 1,
        last_used = CURRENT_TIMESTAMP
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS FOR ANALYTICS
-- ============================================================================

-- Memory usage overview per agent-user
CREATE OR REPLACE VIEW memory_usage_overview AS
SELECT 
    w.agent_id,
    w.user_id,
    COUNT(DISTINCT w.id) as working_memories,
    COUNT(DISTINCT e.id) as episodic_memories,
    COUNT(DISTINCT s.id) as semantic_memories,
    COUNT(DISTINCT p.id) as procedural_memories,
    COUNT(DISTINCT dp.id) as discovered_patterns,
    MAX(GREATEST(w.created_at, e.created_at, s.created_at, p.created_at)) as last_activity
FROM working_memory w
FULL OUTER JOIN episodic_memory e ON w.agent_id = e.agent_id AND w.user_id = e.user_id
FULL OUTER JOIN semantic_memory s ON w.agent_id = s.agent_id AND w.user_id = s.user_id
FULL OUTER JOIN procedural_memory p ON w.agent_id = p.agent_id AND w.user_id = p.user_id
FULL OUTER JOIN discovered_patterns dp ON dp.instance_key = w.agent_id::text || ':' || w.user_id
GROUP BY w.agent_id, w.user_id;

-- Recent memory activity
CREATE OR REPLACE VIEW recent_memory_activity AS
SELECT 
    'working' as memory_type,
    agent_id,
    user_id,
    id,
    created_at,
    CASE 
        WHEN attention_sink THEN 'attention_sink'
        ELSE context_type 
    END as activity_type
FROM working_memory
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'

UNION ALL

SELECT 
    'episodic' as memory_type,
    agent_id,
    user_id,
    id,
    created_at,
    episode_type as activity_type
FROM episodic_memory
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'

UNION ALL

SELECT 
    'semantic' as memory_type,
    agent_id,
    user_id,
    id,
    created_at,
    knowledge_type as activity_type
FROM semantic_memory
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'

UNION ALL

SELECT 
    'procedural' as memory_type,
    agent_id,
    user_id,
    id,
    created_at,
    procedure_type as activity_type
FROM procedural_memory
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'

ORDER BY created_at DESC;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE working_memory IS 'Sliding window context memory with attention sinks and auto-expiration';
COMMENT ON TABLE episodic_memory IS 'Session-specific memories and interaction events with dynamic classification';
COMMENT ON TABLE semantic_memory IS 'Long-term factual knowledge with vector embeddings for RAG integration';
COMMENT ON TABLE procedural_memory IS 'Learned behaviors, patterns, and procedures with adaptation tracking';
COMMENT ON TABLE discovered_patterns IS 'Cross-memory pattern discovery results for agent learning';
COMMENT ON TABLE memory_evolution_history IS 'Memory system evolution tracking for self-improvement';

-- End of Xerus 4-Type Memory System Schema