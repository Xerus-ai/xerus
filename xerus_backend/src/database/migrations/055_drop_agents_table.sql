-- Migration 055: Drop agents table and junction tables
-- All agent data now lives in config.json (sandbox filesystem).
-- agent_registry provides lightweight ID<->slug resolution.
-- Prerequisites: Migration 054 (agent_registry created, agent_slug columns backfilled)

-- Drop junction tables first (they reference agents)
DROP TABLE IF EXISTS agent_tools CASCADE;
DROP TABLE IF EXISTS agent_knowledge_bases CASCADE;
DROP TABLE IF EXISTS agent_skills CASCADE;

-- Drop the main agents table
DROP TABLE IF EXISTS agents CASCADE;

-- Drop skills table (skills now live in .claude/skills/ in the workspace)
DROP TABLE IF EXISTS skills CASCADE;
