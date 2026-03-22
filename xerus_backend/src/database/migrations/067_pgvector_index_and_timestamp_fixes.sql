-- Migration 067: pgvector HNSW index + user_api_keys timestamp fix
--
-- 1. Reduce memory_search_index.embedding from vector(3072) to vector(1536)
--    text-embedding-3-large supports native dimension reduction via API dimensions param
--    Neon pgvector HNSW/IVFFlat indexes have a 2000-dim limit
--    Table is empty so no data re-embedding needed
-- 2. Create HNSW index on memory_search_index.embedding for fast vector search
-- 3. Fix user_api_keys timestamp columns to timestamptz

-- Guard: fail if table has existing data (would need re-embedding)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM memory_search_index LIMIT 1) THEN
    RAISE EXCEPTION 'memory_search_index is not empty; truncate or re-embed before changing dimensions';
  END IF;
END $$;

-- Reduce embedding dimensions (table is empty, safe to alter)
ALTER TABLE memory_search_index
    ALTER COLUMN embedding TYPE vector(1536);

-- pgvector HNSW index (cosine distance, 1536-dim text-embedding-3-large with dimension reduction)
CREATE INDEX IF NOT EXISTS idx_memory_search_index_embedding_hnsw
    ON memory_search_index
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Fix user_api_keys timestamps to timestamptz
ALTER TABLE user_api_keys
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';
