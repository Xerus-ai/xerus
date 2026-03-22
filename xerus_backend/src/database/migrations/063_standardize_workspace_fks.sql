-- Migration: 063_standardize_workspace_fks.sql
-- Description: Standardize workspace FK references.
--   execution_sessions.workspace_id and memory_search_index.workspace_id
--   currently FK to user_workspaces(id). This migration remaps them to
--   workspaces(id) and drops the vestigial user_workspaces table.
-- Depends: 041_workspaces.sql, 022_execution_domain.sql, 028_git_memory_search_index.sql

-- ===== 1. BACKFILL: Create workspace rows for users that have user_workspaces but no workspaces =====
-- user_workspaces.workspace_id is NULL when the user never completed full onboarding.

INSERT INTO workspaces (id, user_id, slug, name, created_at, updated_at)
SELECT gen_random_uuid(), uw.user_id, 'default', 'Default Workspace', uw.created_at, NOW()
FROM user_workspaces uw
WHERE uw.workspace_id IS NULL
AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.user_id = uw.user_id)
ON CONFLICT (user_id) DO NOTHING;

-- ===== 2. REMAP execution_sessions.workspace_id from user_workspaces.id to workspaces.id =====

-- Add a temporary column to hold the new workspace_id
ALTER TABLE execution_sessions ADD COLUMN IF NOT EXISTS new_workspace_id UUID;

-- Populate new_workspace_id by joining through user_workspaces to workspaces
UPDATE execution_sessions es
SET new_workspace_id = w.id
FROM user_workspaces uw
JOIN workspaces w ON w.user_id = uw.user_id
WHERE es.workspace_id = uw.id;

-- Drop the old FK constraint
ALTER TABLE execution_sessions DROP CONSTRAINT IF EXISTS execution_sessions_workspace_id_fkey;

-- Swap: copy new values into workspace_id
UPDATE execution_sessions SET workspace_id = new_workspace_id WHERE new_workspace_id IS NOT NULL;

-- Drop temporary column
ALTER TABLE execution_sessions DROP COLUMN IF EXISTS new_workspace_id;

-- Add new FK to workspaces
ALTER TABLE execution_sessions
    ADD CONSTRAINT execution_sessions_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

-- ===== 3. REMAP memory_search_index.workspace_id from user_workspaces.id to workspaces.id =====

ALTER TABLE memory_search_index ADD COLUMN IF NOT EXISTS new_workspace_id UUID;

UPDATE memory_search_index msi
SET new_workspace_id = w.id
FROM user_workspaces uw
JOIN workspaces w ON w.user_id = uw.user_id
WHERE msi.workspace_id = uw.id;

ALTER TABLE memory_search_index DROP CONSTRAINT IF EXISTS memory_search_index_workspace_id_fkey;

UPDATE memory_search_index SET workspace_id = new_workspace_id WHERE new_workspace_id IS NOT NULL;

ALTER TABLE memory_search_index DROP COLUMN IF EXISTS new_workspace_id;

ALTER TABLE memory_search_index
    ADD CONSTRAINT memory_search_index_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

-- ===== 4. DROP user_workspaces table =====
-- All FKs pointing TO user_workspaces have been removed above.
-- The table itself has an FK to workspaces (workspace_id) and users (user_id) which are dropped with the table.

DROP TABLE IF EXISTS user_workspaces;
