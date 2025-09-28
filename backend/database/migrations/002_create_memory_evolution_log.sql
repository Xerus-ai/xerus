-- Memory Evolution Log Table
-- Tracks detailed memory evolution events and performance metrics
-- Referenced in glass/backend/services/memoryService/memoryEvolution.js

-- Memory Evolution Log - Detailed evolution tracking with performance metrics
CREATE TABLE IF NOT EXISTS memory_evolution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_key VARCHAR(512) NOT NULL, -- agentId:userId
  evolution_event VARCHAR(100) NOT NULL, -- specific evolution event name
  evolution_category VARCHAR(50) NOT NULL, -- strategy_mutation, performance_optimization, pattern_adaptation, memory_cleanup
  event_data JSONB NOT NULL, -- detailed event data
  performance_metrics JSONB, -- performance metrics before/after
  memory_impact JSONB, -- impact on different memory types
  success_score DECIMAL(3,2) DEFAULT 0.5, -- 0.0 to 1.0 success rating
  execution_time_ms INTEGER,
  error_details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints and indexes
  CONSTRAINT memory_evolution_log_instance_idx UNIQUE (id, instance_key)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_memory_evolution_log_instance_time 
ON memory_evolution_log(instance_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_evolution_log_category 
ON memory_evolution_log(evolution_category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_evolution_log_success 
ON memory_evolution_log(success_score DESC, created_at DESC);

-- Function to cleanup old evolution logs (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_evolution_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM memory_evolution_log 
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- View for recent evolution activity
CREATE OR REPLACE VIEW recent_evolution_activity AS
SELECT 
    mel.instance_key,
    mel.evolution_event,
    mel.evolution_category,
    mel.success_score,
    mel.execution_time_ms,
    mel.created_at,
    (mel.event_data->>'details') as event_description
FROM memory_evolution_log mel
WHERE mel.created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
ORDER BY mel.created_at DESC
LIMIT 100;

COMMENT ON TABLE memory_evolution_log IS 'Detailed memory evolution event tracking with performance metrics and success scoring';