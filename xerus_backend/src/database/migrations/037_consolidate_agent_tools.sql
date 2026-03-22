-- Migration: 037_consolidate_agent_tools.sql
-- Description: Consolidate tool storage from capabilities.tools JSONB to agent_tools junction table
-- Depends: 008_tools_pipedream.sql (agent_tools table with app_slug column)
--
-- capabilities.tools stores Pipedream app slugs (gmail, slack, github).
-- agent_tools table (migration 008) is the proper junction table but was unused.
-- This migration moves data from JSONB to agent_tools and removes the JSONB key.

-- Step 1: Migrate capabilities.tools JSONB data to agent_tools junction table
INSERT INTO agent_tools (agent_id, app_slug)
SELECT a.id, tool_slug
FROM agents a
CROSS JOIN LATERAL jsonb_array_elements_text(
    COALESCE(a.capabilities->'tools', '[]'::jsonb)
) AS tool_slug
WHERE jsonb_typeof(COALESCE(a.capabilities->'tools', '[]'::jsonb)) = 'array'
ON CONFLICT (agent_id, app_slug) DO NOTHING;

-- Step 2: Remove tools key from capabilities JSONB
UPDATE agents
SET capabilities = capabilities - 'tools'
WHERE capabilities ? 'tools';
