-- Memory Sharing Rules Table
-- Controls memory isolation and sharing between agents and users
-- Referenced in glass/backend/services/memoryService/memoryIsolation.js

-- Memory Sharing Rules - Controls memory access and sharing policies
CREATE TABLE IF NOT EXISTS memory_sharing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_instance_key VARCHAR(512) NOT NULL, -- agentId:userId that owns the memory
  target_instance_key VARCHAR(512) NOT NULL, -- agentId:userId that can access the memory
  memory_type VARCHAR(50) NOT NULL, -- working, episodic, semantic, procedural, all
  access_level VARCHAR(50) DEFAULT 'read', -- read, write, full
  sharing_scope VARCHAR(50) DEFAULT 'specific', -- specific, domain, global
  conditions JSONB, -- conditions under which sharing applies
  expiry_date TIMESTAMP, -- when this rule expires (null for permanent)
  usage_count INTEGER DEFAULT 0,
  last_used TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT memory_sharing_rules_unique 
    UNIQUE (source_instance_key, target_instance_key, memory_type, access_level),
  CONSTRAINT valid_access_level 
    CHECK (access_level IN ('read', 'write', 'full')),
  CONSTRAINT valid_memory_type 
    CHECK (memory_type IN ('working', 'episodic', 'semantic', 'procedural', 'all')),
  CONSTRAINT valid_sharing_scope 
    CHECK (sharing_scope IN ('specific', 'domain', 'global'))
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_memory_sharing_rules_source 
ON memory_sharing_rules(source_instance_key, memory_type, is_active);

CREATE INDEX IF NOT EXISTS idx_memory_sharing_rules_target 
ON memory_sharing_rules(target_instance_key, memory_type, is_active);

CREATE INDEX IF NOT EXISTS idx_memory_sharing_rules_expiry 
ON memory_sharing_rules(expiry_date) WHERE expiry_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memory_sharing_rules_usage 
ON memory_sharing_rules(usage_count DESC, last_used DESC) WHERE is_active = true;

-- Function to check memory access permission
CREATE OR REPLACE FUNCTION check_memory_access_permission(
  p_source_instance_key VARCHAR(512),
  p_target_instance_key VARCHAR(512),
  p_memory_type VARCHAR(50),
  p_required_access VARCHAR(50) DEFAULT 'read'
)
RETURNS BOOLEAN AS $$
DECLARE
  has_permission BOOLEAN := false;
BEGIN
  -- Self-access is always allowed
  IF p_source_instance_key = p_target_instance_key THEN
    RETURN true;
  END IF;
  
  -- Check for specific rule
  SELECT EXISTS(
    SELECT 1 FROM memory_sharing_rules
    WHERE source_instance_key = p_source_instance_key
      AND target_instance_key = p_target_instance_key
      AND (memory_type = p_memory_type OR memory_type = 'all')
      AND (
        access_level = 'full' OR 
        (p_required_access = 'read' AND access_level IN ('read', 'write', 'full')) OR
        (p_required_access = 'write' AND access_level IN ('write', 'full'))
      )
      AND is_active = true
      AND (expiry_date IS NULL OR expiry_date > CURRENT_TIMESTAMP)
  ) INTO has_permission;
  
  RETURN has_permission;
END;
$$ LANGUAGE plpgsql;

-- Function to update rule usage statistics
CREATE OR REPLACE FUNCTION update_sharing_rule_usage(
  p_source_instance_key VARCHAR(512),
  p_target_instance_key VARCHAR(512),
  p_memory_type VARCHAR(50)
)
RETURNS VOID AS $$
BEGIN
  UPDATE memory_sharing_rules
  SET 
    usage_count = usage_count + 1,
    last_used = CURRENT_TIMESTAMP
  WHERE source_instance_key = p_source_instance_key
    AND target_instance_key = p_target_instance_key
    AND (memory_type = p_memory_type OR memory_type = 'all')
    AND is_active = true;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired sharing rules
CREATE OR REPLACE FUNCTION cleanup_expired_sharing_rules()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM memory_sharing_rules 
  WHERE expiry_date IS NOT NULL 
    AND expiry_date < CURRENT_TIMESTAMP;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- View for active sharing relationships
CREATE OR REPLACE VIEW active_memory_sharing AS
SELECT 
  msr.source_instance_key,
  msr.target_instance_key,
  msr.memory_type,
  msr.access_level,
  msr.sharing_scope,
  msr.usage_count,
  msr.last_used,
  msr.created_at,
  CASE 
    WHEN msr.expiry_date IS NULL THEN 'permanent'
    WHEN msr.expiry_date > CURRENT_TIMESTAMP THEN 'active'
    ELSE 'expired'
  END as rule_status
FROM memory_sharing_rules msr
WHERE msr.is_active = true
  AND (msr.expiry_date IS NULL OR msr.expiry_date > CURRENT_TIMESTAMP)
ORDER BY msr.usage_count DESC, msr.created_at DESC;

-- View for memory sharing statistics
CREATE OR REPLACE VIEW memory_sharing_stats AS
SELECT 
  source_instance_key,
  COUNT(*) as total_rules,
  COUNT(DISTINCT target_instance_key) as unique_targets,
  COUNT(DISTINCT memory_type) as memory_types_shared,
  SUM(usage_count) as total_usage,
  MAX(last_used) as last_shared,
  AVG(CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END) as permanent_rule_ratio
FROM memory_sharing_rules
WHERE is_active = true
GROUP BY source_instance_key
ORDER BY total_usage DESC;

COMMENT ON TABLE memory_sharing_rules IS 'Controls memory access permissions and sharing policies between agent-user instances';