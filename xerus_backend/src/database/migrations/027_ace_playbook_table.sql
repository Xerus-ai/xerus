-- Migration: 027_ace_playbook_table.sql
-- Description: Create ace_playbook table for ACE context loading
-- Depends: 004_agents.sql

-- ===== ACE PLAYBOOK TABLE =====
-- Stores behavioral guidance entries for agents (ACE = Autonomous Cognitive Entity)
-- Reference: docs/planning/ace/playbook.md

CREATE TABLE IF NOT EXISTS ace_playbook (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    domain VARCHAR(50) NOT NULL DEFAULT 'general',
    insight_type VARCHAR(50) NOT NULL DEFAULT 'success_pattern',
    keywords TEXT[] DEFAULT '{}',
    helpfulness DECIMAL(3, 2) NOT NULL DEFAULT 0.5,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    usage_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    CONSTRAINT ace_playbook_domain_check CHECK (domain IN ('general', 'productivity', 'technical', 'creative', 'custom')),
    CONSTRAINT ace_playbook_insight_type_check CHECK (insight_type IN ('success_pattern', 'error_prevention', 'user_preference', 'workflow', 'imported')),
    CONSTRAINT ace_playbook_status_check CHECK (status IN ('active', 'deprecated', 'merged', 'pruned')),
    CONSTRAINT ace_playbook_helpfulness_check CHECK (helpfulness >= 0 AND helpfulness <= 1)
);

CREATE INDEX IF NOT EXISTS idx_ace_playbook_agent_id ON ace_playbook(agent_id);
CREATE INDEX IF NOT EXISTS idx_ace_playbook_agent_status ON ace_playbook(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_ace_playbook_helpfulness ON ace_playbook(helpfulness DESC);

COMMENT ON TABLE ace_playbook IS 'ACE behavioral guidance entries - success patterns, error prevention, user preferences';
COMMENT ON COLUMN ace_playbook.domain IS 'Domain category: general, productivity, technical, creative, custom';
COMMENT ON COLUMN ace_playbook.insight_type IS 'Type: success_pattern, error_prevention, user_preference, workflow, imported';
COMMENT ON COLUMN ace_playbook.helpfulness IS 'Helpfulness score 0-1, used for ranking entries';
COMMENT ON COLUMN ace_playbook.status IS 'Status: active, deprecated, merged, pruned';

-- ===== UPDATED_AT TRIGGER =====

DROP TRIGGER IF EXISTS set_ace_playbook_updated_at ON ace_playbook;
CREATE TRIGGER set_ace_playbook_updated_at
    BEFORE UPDATE ON ace_playbook
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
