-- Migration: 039_drop_agent_columns.sql
-- Description: Drop system_prompt, capabilities, workflow_config from agents table
-- These columns are no longer needed (agent_templates was subsequently dropped in 051)
-- Depends: 038_agent_templates.sql
-- Reference: docs/plans/2026-02-21-workspace-lifecycle-design.md Section 5

ALTER TABLE agents DROP COLUMN IF EXISTS system_prompt;
ALTER TABLE agents DROP COLUMN IF EXISTS capabilities;
ALTER TABLE agents DROP COLUMN IF EXISTS workflow_config;
