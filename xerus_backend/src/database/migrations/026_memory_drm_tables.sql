-- Migration: 026_memory_drm_tables.sql
-- Description: Create memory tables for DRM compression system
-- Depends: 004_agents.sql

-- ===== 1. EPISODIC MEMORY TABLE =====
-- Stores session summaries and task histories

CREATE TABLE IF NOT EXISTS episodic_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL,
    task_summary TEXT NOT NULL,
    outcome VARCHAR(20) NOT NULL DEFAULT 'success',
    lessons_learned TEXT[] DEFAULT '{}',
    tools_used TEXT[] DEFAULT '{}',
    importance_score DECIMAL(3, 2) DEFAULT 0.5,
    drm_tier VARCHAR(20) NOT NULL DEFAULT 'lossless',
    token_count INTEGER DEFAULT 0,
    promoted_to_semantic BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    CONSTRAINT episodic_memory_outcome_check CHECK (outcome IN ('success', 'partial', 'failed')),
    CONSTRAINT episodic_memory_drm_tier_check CHECK (drm_tier IN ('lossless', 'daily', 'weekly', 'monthly')),
    CONSTRAINT episodic_memory_importance_check CHECK (importance_score >= 0 AND importance_score <= 1)
);

CREATE INDEX IF NOT EXISTS idx_episodic_memory_agent_id ON episodic_memory(agent_id);
CREATE INDEX IF NOT EXISTS idx_episodic_memory_session_id ON episodic_memory(session_id);
CREATE INDEX IF NOT EXISTS idx_episodic_memory_drm_tier ON episodic_memory(drm_tier);
CREATE INDEX IF NOT EXISTS idx_episodic_memory_created_at ON episodic_memory(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodic_memory_compression ON episodic_memory(agent_id, drm_tier, created_at);

COMMENT ON TABLE episodic_memory IS 'Agent episodic memory - session summaries with DRM tiered compression';
COMMENT ON COLUMN episodic_memory.drm_tier IS 'Compression tier: lossless (7d), daily (30d), weekly (90d), monthly (365d)';
COMMENT ON COLUMN episodic_memory.importance_score IS 'Relevance score 0-1, used for compression prioritization';

-- ===== 2. SEMANTIC MEMORY TABLE =====
-- Stores learned facts and preferences

CREATE TABLE IF NOT EXISTS semantic_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    fact TEXT NOT NULL,
    category VARCHAR(100) DEFAULT 'general',
    confidence_score DECIMAL(3, 2) DEFAULT 0.5,
    usage_count INTEGER DEFAULT 0,
    importance_score DECIMAL(3, 2) DEFAULT 0.5,
    source_episode_ids UUID[] DEFAULT '{}',
    embedding VECTOR(3072),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    CONSTRAINT semantic_memory_confidence_check CHECK (confidence_score >= 0 AND confidence_score <= 1),
    CONSTRAINT semantic_memory_importance_check CHECK (importance_score >= 0 AND importance_score <= 1)
);

CREATE INDEX IF NOT EXISTS idx_semantic_memory_agent_id ON semantic_memory(agent_id);
CREATE INDEX IF NOT EXISTS idx_semantic_memory_category ON semantic_memory(agent_id, category);
CREATE INDEX IF NOT EXISTS idx_semantic_memory_confidence ON semantic_memory(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_semantic_memory_fact_search ON semantic_memory(agent_id, LOWER(fact));

COMMENT ON TABLE semantic_memory IS 'Agent semantic memory - learned facts and preferences';
COMMENT ON COLUMN semantic_memory.confidence_score IS 'Confidence in fact accuracy 0-1';
COMMENT ON COLUMN semantic_memory.usage_count IS 'How many times this fact has been retrieved';

-- ===== 3. MEMORY EVOLUTION LOG TABLE =====
-- Tracks compression and merge operations for observability

CREATE TABLE IF NOT EXISTS memory_evolution_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    operation VARCHAR(20) NOT NULL,
    source_tier VARCHAR(20),
    target_tier VARCHAR(20),
    entries_affected INTEGER NOT NULL DEFAULT 0,
    tokens_before INTEGER NOT NULL DEFAULT 0,
    tokens_after INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    CONSTRAINT evolution_log_operation_check CHECK (operation IN ('compress', 'merge', 'prune')),
    CONSTRAINT evolution_log_source_tier_check CHECK (source_tier IS NULL OR source_tier IN ('lossless', 'daily', 'weekly', 'monthly')),
    CONSTRAINT evolution_log_target_tier_check CHECK (target_tier IS NULL OR target_tier IN ('lossless', 'daily', 'weekly', 'monthly'))
);

CREATE INDEX IF NOT EXISTS idx_memory_evolution_log_agent_id ON memory_evolution_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_memory_evolution_log_operation ON memory_evolution_log(operation);
CREATE INDEX IF NOT EXISTS idx_memory_evolution_log_created_at ON memory_evolution_log(created_at DESC);

COMMENT ON TABLE memory_evolution_log IS 'Audit log for DRM compression and semantic merge operations';
COMMENT ON COLUMN memory_evolution_log.operation IS 'compress, merge, or prune';

-- ===== 4. MEMORY EVOLUTION HISTORY TABLE =====
-- Tracks configuration changes for memory settings

CREATE TABLE IF NOT EXISTS memory_evolution_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    config_type VARCHAR(50) NOT NULL,
    old_value JSONB,
    new_value JSONB NOT NULL,
    changed_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_evolution_history_agent_id ON memory_evolution_history(agent_id);
CREATE INDEX IF NOT EXISTS idx_memory_evolution_history_created_at ON memory_evolution_history(created_at DESC);

COMMENT ON TABLE memory_evolution_history IS 'Configuration change history for memory settings';

-- ===== 5. UPDATED_AT TRIGGERS =====

DROP TRIGGER IF EXISTS set_episodic_memory_updated_at ON episodic_memory;
CREATE TRIGGER set_episodic_memory_updated_at
    BEFORE UPDATE ON episodic_memory
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_semantic_memory_updated_at ON semantic_memory;
CREATE TRIGGER set_semantic_memory_updated_at
    BEFORE UPDATE ON semantic_memory
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
