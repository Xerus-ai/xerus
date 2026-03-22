-- Migration: 066_absorb_sandbox_registry.sql
-- Description: Absorb sandbox_registry columns into workspaces table.
--   sandbox_registry is a per-user singleton (UNIQUE user_id) that maps 1:1 to workspaces.
--   After migration 063 dropped user_workspaces, sandbox_registry is the last vestigial
--   table in the workspace cluster. This migration collapses it into workspaces.
-- Depends: 063_standardize_workspace_fks.sql, 022_execution_domain.sql, 025_execution_domain_fixes.sql

-- ===== 1. ADD SANDBOX COLUMNS TO WORKSPACES =====
-- All nullable: a workspace may exist before a sandbox is provisioned.

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS sandbox_id                     TEXT,
    ADD COLUMN IF NOT EXISTS sandbox_status                 VARCHAR(20),
    ADD COLUMN IF NOT EXISTS sandbox_template_version       TEXT,
    ADD COLUMN IF NOT EXISTS sandbox_paused_at              TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sandbox_last_activity_at       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sandbox_active_agent_id        INTEGER,
    ADD COLUMN IF NOT EXISTS sandbox_active_execution_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sandbox_total_runtime_seconds  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sandbox_resume_count           INTEGER NOT NULL DEFAULT 0;

ALTER TABLE workspaces
    ADD CONSTRAINT workspaces_sandbox_status_check
    CHECK (sandbox_status IS NULL OR sandbox_status IN (
        'running', 'paused', 'stopped', 'archived', 'error', 'killed'
    ));

-- ===== 2. BACKFILL: Copy sandbox_registry data into workspaces =====
-- Join on user_id (both tables have UNIQUE(user_id)).

UPDATE workspaces w
SET
    sandbox_id                     = sr.sandbox_id,
    sandbox_status                 = sr.status,
    sandbox_template_version       = sr.template_version,
    sandbox_paused_at              = sr.paused_at,
    sandbox_last_activity_at       = sr.last_activity_at,
    sandbox_active_agent_id        = sr.active_agent_id,
    sandbox_active_execution_count = sr.active_execution_count,
    sandbox_total_runtime_seconds  = sr.total_runtime_seconds,
    sandbox_resume_count           = sr.resume_count
FROM sandbox_registry sr
WHERE sr.user_id = w.user_id;

-- ===== 3. CREATE ROWS FOR ORPHANED sandbox_registry ENTRIES =====
-- Users who have a sandbox_registry row but no workspaces row (edge case).

INSERT INTO workspaces (user_id, slug, name, sandbox_id, sandbox_status, sandbox_template_version,
    sandbox_paused_at, sandbox_last_activity_at, sandbox_active_agent_id,
    sandbox_active_execution_count, sandbox_total_runtime_seconds, sandbox_resume_count, created_at)
SELECT sr.user_id, 'default', 'Default Workspace', sr.sandbox_id, sr.status, sr.template_version,
    sr.paused_at, sr.last_activity_at, sr.active_agent_id,
    sr.active_execution_count, sr.total_runtime_seconds, sr.resume_count, sr.created_at
FROM sandbox_registry sr
WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.user_id = sr.user_id)
ON CONFLICT (user_id) DO NOTHING;

-- ===== 4. ADD INDEXES =====

CREATE INDEX IF NOT EXISTS idx_workspaces_sandbox_id
    ON workspaces(sandbox_id) WHERE sandbox_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workspaces_sandbox_status
    ON workspaces(sandbox_status) WHERE sandbox_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workspaces_sandbox_last_activity
    ON workspaces(sandbox_last_activity_at) WHERE sandbox_last_activity_at IS NOT NULL;

-- ===== 5. DROP sandbox_registry table =====
-- DROP TABLE implicitly removes all constraints, indexes, triggers on that table.
-- FKs from sandbox_registry: workspace_id -> workspaces, user_id -> users, active_agent_id -> agents

DROP TRIGGER IF EXISTS sandbox_registry_activity ON sandbox_registry;
DROP FUNCTION IF EXISTS update_sandbox_registry_timestamp();
DROP TABLE IF EXISTS sandbox_registry;

-- ===== 6. COMMENTS =====

COMMENT ON COLUMN workspaces.sandbox_id IS 'Daytona sandbox identifier. NULL if no sandbox provisioned yet';
COMMENT ON COLUMN workspaces.sandbox_status IS 'running, paused, stopped, archived, error, killed. NULL if no sandbox';
COMMENT ON COLUMN workspaces.sandbox_last_activity_at IS 'Last sandbox activity timestamp';
COMMENT ON COLUMN workspaces.sandbox_active_execution_count IS 'Number of concurrent executions in this sandbox';
COMMENT ON COLUMN workspaces.sandbox_total_runtime_seconds IS 'Cumulative sandbox runtime for billing';
COMMENT ON COLUMN workspaces.sandbox_resume_count IS 'Number of times sandbox was resumed from paused state';
