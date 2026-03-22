-- Migration: 041_workspaces.sql
-- Description: Add workspaces table as identity hub. Link domains, user_workspaces, sandbox_registry via workspace_id FK.
-- Depends: 022_execution_domain.sql, 033_v2_company_hierarchy.sql

-- ===== 1. WORKSPACES TABLE =====
-- Identity hub: name, slug, ownership. Separate from storage (user_workspaces) and sandbox (sandbox_registry).
-- UNIQUE(user_id) enforces single-workspace-per-user for now. Drop this constraint later for multi-workspace.

CREATE TABLE IF NOT EXISTS workspaces (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    slug        TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id),
    UNIQUE(user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_workspaces_user ON workspaces(user_id);

COMMENT ON TABLE workspaces IS 'Workspace identity hub - name and slug. One per user (for now).';
COMMENT ON COLUMN workspaces.slug IS 'URL-safe identifier unique per user';

-- ===== 2. ADD workspace_id FK TO DOMAINS =====

ALTER TABLE domains ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_domains_workspace ON domains(workspace_id);

-- Change unique constraint from (user_id, slug) to (workspace_id, slug)
-- Safe: no production data exists yet (test data only)
ALTER TABLE domains DROP CONSTRAINT IF EXISTS domains_user_id_slug_key;
ALTER TABLE domains ADD CONSTRAINT domains_workspace_slug_unique UNIQUE(workspace_id, slug);

COMMENT ON COLUMN domains.workspace_id IS 'FK to workspaces table - workspace this domain belongs to';

-- ===== 3. ADD workspace_id FK TO USER_WORKSPACES =====
-- Links storage metadata to workspace identity

ALTER TABLE user_workspaces ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_workspaces_workspace ON user_workspaces(workspace_id);

COMMENT ON COLUMN user_workspaces.workspace_id IS 'FK to workspaces - links S3 storage to workspace identity';

-- ===== 4. ADD workspace_id FK TO SANDBOX_REGISTRY =====
-- Links sandbox instance to workspace identity

ALTER TABLE sandbox_registry ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sandbox_registry_workspace ON sandbox_registry(workspace_id);

COMMENT ON COLUMN sandbox_registry.workspace_id IS 'FK to workspaces - links Daytona sandbox to workspace identity';

-- ===== 5. UPDATED_AT TRIGGER =====

DROP TRIGGER IF EXISTS set_workspaces_updated_at ON workspaces;
CREATE TRIGGER set_workspaces_updated_at
    BEFORE UPDATE ON workspaces
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
