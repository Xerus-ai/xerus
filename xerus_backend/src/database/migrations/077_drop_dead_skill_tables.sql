-- Drop dead skill tables
-- These tables were created in 047_skills.sql and extended in 048_skills_marketplace.sql
-- but zero application code queries them. Skills are entirely filesystem-based
-- (.claude/skills/ in the Daytona sandbox). No data to preserve.

-- Drop dependent objects first
DROP TRIGGER IF EXISTS trigger_skills_updated_at ON skills;
DROP FUNCTION IF EXISTS update_skills_updated_at();

-- Drop tables (agent_skills has FK to skills, so drop it first)
DROP TABLE IF EXISTS agent_skills;
DROP TABLE IF EXISTS skills;
