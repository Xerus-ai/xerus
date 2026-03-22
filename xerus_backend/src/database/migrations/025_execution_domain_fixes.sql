-- Migration: 025_execution_domain_fixes.sql
-- Description: Add missing columns to align DB schema with TypeScript types
-- Run: Execute in Neon DB (Xerus database)
-- Date: 2025-02-13

-- ===== 1. SANDBOX_REGISTRY - Add missing execution tracking columns =====

ALTER TABLE sandbox_registry
    ADD COLUMN IF NOT EXISTS active_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS active_execution_count INTEGER DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS total_runtime_seconds INTEGER DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS resume_count INTEGER DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sandbox_registry_active_agent ON sandbox_registry(active_agent_id) WHERE active_agent_id IS NOT NULL;

COMMENT ON COLUMN sandbox_registry.active_agent_id IS 'Currently executing agent ID (if any)';
COMMENT ON COLUMN sandbox_registry.active_execution_count IS 'Number of concurrent executions in this sandbox';
COMMENT ON COLUMN sandbox_registry.total_runtime_seconds IS 'Cumulative sandbox runtime for billing';
COMMENT ON COLUMN sandbox_registry.resume_count IS 'Number of times sandbox was resumed from paused state';

-- Fix status constraint to include 'killed' state
ALTER TABLE sandbox_registry DROP CONSTRAINT IF EXISTS sandbox_registry_status_check;
ALTER TABLE sandbox_registry ADD CONSTRAINT sandbox_registry_status_check
    CHECK (status IN ('running', 'paused', 'stopped', 'archived', 'error', 'killed'));

-- ===== 2. EXECUTION_QUEUE - Add coordination_mode column =====

ALTER TABLE execution_queue
    ADD COLUMN IF NOT EXISTS coordination_mode VARCHAR(20);

COMMENT ON COLUMN execution_queue.coordination_mode IS 'Team coordination mode: sequential, parallel, hierarchical, consensus';

-- ===== 3. EXECUTION_LANES - Add execution tracking columns =====

ALTER TABLE execution_lanes
    ADD COLUMN IF NOT EXISTS agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS prompt TEXT,
    ADD COLUMN IF NOT EXISTS trigger_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS coordination_mode VARCHAR(20),
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_execution_lanes_agent ON execution_lanes(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_execution_lanes_status ON execution_lanes(status);

COMMENT ON COLUMN execution_lanes.agent_id IS 'Agent currently using this lane';
COMMENT ON COLUMN execution_lanes.started_at IS 'When execution started in this lane';
COMMENT ON COLUMN execution_lanes.prompt IS 'Execution prompt/task';
COMMENT ON COLUMN execution_lanes.trigger_type IS 'What triggered this execution';
COMMENT ON COLUMN execution_lanes.status IS 'Lane execution status';

-- ===== 4. AGENT_TRIGGERS - Add missing columns =====

ALTER TABLE agent_triggers
    ADD COLUMN IF NOT EXISTS account_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_agent_triggers_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_triggers_updated ON agent_triggers;
CREATE TRIGGER agent_triggers_updated
    BEFORE UPDATE ON agent_triggers
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_triggers_timestamp();

COMMENT ON COLUMN agent_triggers.account_id IS 'User connected account ID for this app';
COMMENT ON COLUMN agent_triggers.updated_at IS 'Last update timestamp';
