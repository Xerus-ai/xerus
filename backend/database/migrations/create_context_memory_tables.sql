-- Enhanced Context Memory System Database Schema
-- Tables for context decision tracking, pattern learning, and session management

-- Enable pgvector extension for embedding storage
CREATE EXTENSION IF NOT EXISTS vector;

-- Context Decision Records - Track all context intelligence decisions
CREATE TABLE IF NOT EXISTS context_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255),
  session_id VARCHAR(255),
  agent_id VARCHAR(255),
  query_text TEXT,
  query_hash VARCHAR(64), -- For efficient lookups
  query_embedding VECTOR(1536), -- OpenAI embedding
  decision_primary VARCHAR(50), -- screenshot, knowledge, hybrid, fallback
  screen_score DECIMAL(3,2),
  kb_score DECIMAL(3,2),
  confidence DECIMAL(3,2),
  use_screenshot BOOLEAN,
  use_knowledge BOOLEAN,
  reasoning JSONB,
  execution_time_ms INTEGER,
  outcome_score DECIMAL(3,2) DEFAULT 0.5, -- Feedback-based success score
  context_anchors JSONB, -- Active anchors that influenced decision
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Context Patterns - Learned patterns for different query types
CREATE TABLE IF NOT EXISTS context_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255),
  pattern_type VARCHAR(50), -- query_type, domain, temporal, context_preference
  pattern_identifier VARCHAR(255), -- e.g., "morning_queries", "technical_questions"
  pattern_vector VECTOR(1536),
  confidence_score DECIMAL(3,2),
  sample_count INTEGER DEFAULT 1,
  success_rate DECIMAL(3,2),
  preferred_context VARCHAR(50),
  weight_adjustments JSONB, -- Dynamic weight adjustments for this pattern
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Context Anchors - Hierarchical context anchors (agent, visual, knowledge, user)
CREATE TABLE IF NOT EXISTS context_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anchor_level VARCHAR(20), -- agent, visual, knowledge, user
  identifier VARCHAR(255), -- agentId, userId, contentHash, etc.
  context_vector VECTOR(1536),
  strength DECIMAL(3,2) DEFAULT 1.0,
  usage_count INTEGER DEFAULT 1,
  success_rate DECIMAL(3,2) DEFAULT 0.5,
  decay_factor DECIMAL(3,2) DEFAULT 0.95, -- For temporal decay
  metadata JSONB, -- Additional anchor-specific data
  last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Session Context State - Track session-level context patterns
CREATE TABLE IF NOT EXISTS session_contexts (
  session_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255),
  agent_id VARCHAR(255),
  dominant_context VARCHAR(50), -- screenshot, knowledge, hybrid
  context_momentum JSONB, -- Recent context preferences
  conversation_summary TEXT,
  decision_count INTEGER DEFAULT 0,
  avg_confidence DECIMAL(3,2) DEFAULT 0.5,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '4 hours'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying

-- Context Decisions indexes
CREATE INDEX IF NOT EXISTS idx_context_decisions_user_time 
ON context_decisions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_context_decisions_session 
ON context_decisions(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_context_decisions_query_hash 
ON context_decisions(query_hash);

CREATE INDEX IF NOT EXISTS idx_context_decisions_embedding 
ON context_decisions USING ivfflat (query_embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_context_decisions_agent_user 
ON context_decisions(agent_id, user_id, created_at DESC);

-- Context Patterns indexes
CREATE INDEX IF NOT EXISTS idx_context_patterns_user 
ON context_patterns(user_id, pattern_type);

CREATE INDEX IF NOT EXISTS idx_context_patterns_vector 
ON context_patterns USING ivfflat (pattern_vector vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_context_patterns_confidence 
ON context_patterns(confidence_score DESC, sample_count DESC);

-- Context Anchors indexes
CREATE INDEX IF NOT EXISTS idx_context_anchors_level_identifier 
ON context_anchors(anchor_level, identifier);

CREATE INDEX IF NOT EXISTS idx_context_anchors_vector 
ON context_anchors USING ivfflat (context_vector vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_context_anchors_usage 
ON context_anchors(usage_count DESC, last_used DESC);

-- Session Contexts indexes
CREATE INDEX IF NOT EXISTS idx_session_contexts_user 
ON session_contexts(user_id, last_activity DESC);

CREATE INDEX IF NOT EXISTS idx_session_contexts_expires 
ON session_contexts(expires_at);

-- Functions for maintenance

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM session_contexts WHERE expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to decay anchor strengths over time
CREATE OR REPLACE FUNCTION decay_anchor_strengths()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE context_anchors 
    SET strength = strength * decay_factor,
        last_used = last_used
    WHERE last_used < CURRENT_TIMESTAMP - INTERVAL '7 days';
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate pattern success rates
CREATE OR REPLACE FUNCTION update_pattern_success_rates()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    WITH pattern_stats AS (
        SELECT 
            cp.id,
            AVG(cd.outcome_score) as new_success_rate,
            COUNT(*) as new_sample_count
        FROM context_patterns cp
        LEFT JOIN context_decisions cd ON 
            cd.user_id = cp.user_id AND 
            cd.query_embedding <-> cp.pattern_vector < 0.3
        WHERE cd.created_at > cp.last_updated - INTERVAL '30 days'
        GROUP BY cp.id
    )
    UPDATE context_patterns cp
    SET 
        success_rate = COALESCE(ps.new_success_rate, cp.success_rate),
        sample_count = COALESCE(ps.new_sample_count, cp.sample_count),
        last_updated = CURRENT_TIMESTAMP
    FROM pattern_stats ps
    WHERE cp.id = ps.id;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Views for analytics

-- Recent context decisions view
CREATE OR REPLACE VIEW recent_context_decisions AS
SELECT 
    cd.*,
    sc.dominant_context as session_dominant_context,
    sc.context_momentum as session_momentum
FROM context_decisions cd
LEFT JOIN session_contexts sc ON cd.session_id = sc.session_id
WHERE cd.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
ORDER BY cd.created_at DESC;

-- User context patterns view
CREATE OR REPLACE VIEW user_context_patterns AS
SELECT 
    user_id,
    COUNT(*) as total_decisions,
    AVG(confidence) as avg_confidence,
    AVG(outcome_score) as avg_outcome_score,
    STRING_AGG(DISTINCT decision_primary, ', ') as preferred_contexts,
    DATE_TRUNC('day', created_at) as decision_date
FROM context_decisions
WHERE user_id IS NOT NULL
GROUP BY user_id, DATE_TRUNC('day', created_at)
ORDER BY decision_date DESC;

COMMENT ON TABLE context_decisions IS 'Tracks all context intelligence decisions for learning and analytics';
COMMENT ON TABLE context_patterns IS 'Learned patterns for different query types and user preferences';
COMMENT ON TABLE context_anchors IS 'Hierarchical context anchors for maintaining context persistence';
COMMENT ON TABLE session_contexts IS 'Session-level context state and conversation tracking';