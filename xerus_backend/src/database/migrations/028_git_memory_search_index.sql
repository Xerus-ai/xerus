-- Migration: 028_git_memory_search_index.sql
-- Description: Replace episodic/semantic memory tables with git-based memory search index
-- Depends: 022_execution_domain.sql, 026_memory_drm_tables.sql
-- Reference: docs/planning/execution/git-memory-system.md
--
-- Git files in .memory/ are now the source of truth for agent memory.
-- This migration:
--   1. Drops episodic_memory and semantic_memory (replaced by git files)
--   2. Keeps memory_evolution_log and memory_evolution_history (DRM audit trail)
--   3. Creates memory_search_index (pgvector search optimization layer)
--   4. Adds memory_commit_sha to execution_sessions (git commit tracking)

-- ===== 1. DROP REPLACED TABLES =====
-- episodic_memory and semantic_memory are replaced by git files in .memory/
-- Drop triggers first, then tables

DROP TRIGGER IF EXISTS set_episodic_memory_updated_at ON episodic_memory;
DROP TABLE IF EXISTS episodic_memory;

DROP TRIGGER IF EXISTS set_semantic_memory_updated_at ON semantic_memory;
DROP TABLE IF EXISTS semantic_memory;

-- memory_evolution_log and memory_evolution_history are KEPT for DRM audit trail

-- ===== 2. CREATE MEMORY SEARCH INDEX TABLE =====
-- pgvector-backed search index for .memory/ git files
-- This is a READ OPTIMIZATION layer, not the source of truth
-- Source of truth: git files in .memory/ on Daytona workspace volume

CREATE TABLE IF NOT EXISTS memory_search_index (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES user_workspaces(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    chunk_start_line INTEGER NOT NULL,
    chunk_end_line INTEGER NOT NULL,
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    memory_type VARCHAR(20) NOT NULL,
    scope VARCHAR(20) NOT NULL,
    project_id INTEGER,
    channel_id INTEGER,
    agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
    embedding vector(3072) NOT NULL,
    commit_sha TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    CONSTRAINT msi_scope_check CHECK (scope IN ('workspace', 'project', 'channel', 'agent')),
    CONSTRAINT msi_memory_type_check CHECK (memory_type IN ('working', 'episodic', 'semantic', 'procedural', 'action_history')),
    CONSTRAINT msi_chunk_range_check CHECK (chunk_end_line >= chunk_start_line)
);

-- Unique constraint for upsert (ON CONFLICT) on workspace + file + chunk position
CREATE UNIQUE INDEX IF NOT EXISTS idx_msi_upsert_key ON memory_search_index(workspace_id, file_path, chunk_start_line);

-- Regular indexes for filtered queries
CREATE INDEX IF NOT EXISTS idx_msi_scope ON memory_search_index(workspace_id, scope);
CREATE INDEX IF NOT EXISTS idx_msi_type ON memory_search_index(workspace_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_msi_project ON memory_search_index(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_msi_channel ON memory_search_index(channel_id) WHERE channel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_msi_agent ON memory_search_index(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_msi_content_hash ON memory_search_index(workspace_id, file_path, content_hash);

-- HNSW index for vector similarity search (cosine distance)
CREATE INDEX IF NOT EXISTS idx_msi_embedding ON memory_search_index USING hnsw (embedding vector_cosine_ops);

-- GIN index for full-text search on content
CREATE INDEX IF NOT EXISTS idx_msi_content_fts ON memory_search_index USING gin (to_tsvector('english', content));

COMMENT ON TABLE memory_search_index IS 'pgvector search index for git-based memory files in .memory/';
COMMENT ON COLUMN memory_search_index.file_path IS 'Relative path within .memory/ (e.g., agents/seo-agent/semantic.md)';
COMMENT ON COLUMN memory_search_index.content_hash IS 'SHA-256 hash of chunk content for deduplication';
COMMENT ON COLUMN memory_search_index.memory_type IS 'working, episodic, semantic, procedural, action_history';
COMMENT ON COLUMN memory_search_index.scope IS 'workspace, project, channel, agent';
COMMENT ON COLUMN memory_search_index.embedding IS 'text-embedding-3-large vector (3072 dimensions)';
COMMENT ON COLUMN memory_search_index.commit_sha IS 'Git commit SHA that produced this chunk';

-- ===== 3. ADD MEMORY COMMIT SHA TO EXECUTION SESSIONS =====
-- Track which git commit corresponds to each agent session

ALTER TABLE execution_sessions ADD COLUMN IF NOT EXISTS memory_commit_sha TEXT;

COMMENT ON COLUMN execution_sessions.memory_commit_sha IS 'Git commit SHA of last memory save during this session';

-- ===== 4. UPDATED_AT TRIGGER =====

DROP TRIGGER IF EXISTS set_memory_search_index_updated_at ON memory_search_index;
CREATE TRIGGER set_memory_search_index_updated_at
    BEFORE UPDATE ON memory_search_index
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
