-- Migration: 030_discovered_patterns
-- Creates the discovered_patterns table for the pattern discovery system.
-- Reference: docs/planning/execution/memory-pattern-discovery.md

CREATE TABLE IF NOT EXISTS discovered_patterns (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    instance_key VARCHAR(512) NOT NULL,
    agent_id INTEGER,
    user_id VARCHAR(255),
    pattern_type VARCHAR(50) NOT NULL,
    pattern_name VARCHAR(255) NOT NULL,
    pattern_data JSONB NOT NULL,
    confidence_score NUMERIC(3, 2) DEFAULT 0.5,
    occurrences INTEGER DEFAULT 1,
    memory_types VARCHAR(100),
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE (instance_key, pattern_type, pattern_name),
    CHECK ((confidence_score >= 0.0) AND (confidence_score <= 1.0))
);

CREATE INDEX IF NOT EXISTS idx_patterns_agent ON discovered_patterns(agent_id);
CREATE INDEX IF NOT EXISTS idx_patterns_user ON discovered_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_patterns_instance ON discovered_patterns(instance_key);
CREATE INDEX IF NOT EXISTS idx_patterns_type ON discovered_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON discovered_patterns(confidence_score DESC);
