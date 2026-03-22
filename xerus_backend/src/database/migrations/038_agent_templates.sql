-- Migration: 038_agent_templates.sql
-- Description: Create agent_templates table for clone blueprints
-- Depends: 004_agents.sql
-- Reference: docs/plans/2026-02-21-workspace-lifecycle-design.md (Section 5)
--
-- agent_templates stores the "birth certificate" of an agent -- the snapshot
-- of system_prompt, capabilities, and workflow_config at clone time.
-- After scaffold, workspace files evolve independently of this table.
--
-- Scope:
--   Marketplace/public agents: YES (clone source)
--   Cloned agents: YES (snapshot of clone origin)
--   Xerus-created agents: NO (workspace files are origin, no DB blueprint)
--
-- The agent_templates row is OPTIONAL. Missing template = agent created
-- by Xerus (no DB blueprint). Scaffold priority chain handles this:
--   1. S3 files (user edits before first run)
--   2. agent_templates row (clone blueprint)
--   3. buildAllSoulFiles() templates (new agent, last resort)

-- ===== 1. CREATE AGENT_TEMPLATES TABLE =====

CREATE TABLE IF NOT EXISTS agent_templates (
    agent_id        INTEGER PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
    system_prompt   JSONB NOT NULL,
    capabilities    JSONB,
    workflow_config JSONB,
    created_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE agent_templates IS 'Clone blueprints: snapshot of agent config at clone time. Optional -- missing = Xerus-created agent.';
COMMENT ON COLUMN agent_templates.agent_id IS 'References agents(id). CASCADE delete removes template with agent.';
COMMENT ON COLUMN agent_templates.system_prompt IS 'Structured prompt snapshot: identity, goals, capabilities, guidelines, constraints, personality';
COMMENT ON COLUMN agent_templates.capabilities IS 'Skills, permissions, constraints, model_config, style snapshot';
COMMENT ON COLUMN agent_templates.workflow_config IS 'Execution routing snapshot: executionMode, coordinationMode, workflowStrategy';

-- ===== 2. MIGRATE EXISTING DATA =====
-- Copy system_prompt, capabilities, workflow_config from agents table.
-- Only rows where system_prompt IS NOT NULL (Xerus-created agents have no template).
-- ON CONFLICT DO NOTHING for idempotent re-runs.

INSERT INTO agent_templates (agent_id, system_prompt, capabilities, workflow_config, created_at)
SELECT id, system_prompt, capabilities, workflow_config, created_at
FROM agents
WHERE system_prompt IS NOT NULL
ON CONFLICT (agent_id) DO NOTHING;
