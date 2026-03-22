-- Migration 051: Drop agent_templates table
-- agent.md in the marketplace IS the system prompt. Soul files are separate workspace files.
-- Template data was duplicated: agent.md (marketplace) -> agent_templates JSONB (DB) -> workspace files.
-- Now scaffold reads from agents table metadata + agent_tools junction table directly.

DROP TABLE IF EXISTS agent_templates;
