-- Migration 052: Drop dead tables and columns from architectural pivots
--
-- Dead tables:
--   episodic_memory, semantic_memory, memory_evolution_log, memory_evolution_history
--     → DRM memory system superseded by git-based .memory/ (Feb 2025 pivot)
--   discovered_patterns
--     → Pattern discovery system never implemented
--   channel_knowledge_bases, domain_knowledge_bases
--     → Drive KB assignment never wired into application code
--   execution_queue, execution_lanes
--     → Queue-based execution never implemented (direct sandbox dispatch)
--
-- Dead columns on user_workspaces:
--   s3_bucket, s3_prefix, total_size_bytes, file_count, last_synced_at
--     → S3 workspace sync replaced by Daytona persistent volumes

-- ===== DROP DEAD TABLES =====

DROP TABLE IF EXISTS episodic_memory;
DROP TABLE IF EXISTS semantic_memory;
DROP TABLE IF EXISTS memory_evolution_log;
DROP TABLE IF EXISTS memory_evolution_history;
DROP TABLE IF EXISTS discovered_patterns;
DROP TABLE IF EXISTS channel_knowledge_bases;
DROP TABLE IF EXISTS domain_knowledge_bases;
DROP TABLE IF EXISTS execution_queue;
DROP TABLE IF EXISTS execution_lanes;

-- ===== DROP DEAD COLUMNS =====

ALTER TABLE user_workspaces DROP COLUMN IF EXISTS s3_bucket;
ALTER TABLE user_workspaces DROP COLUMN IF EXISTS s3_prefix;
ALTER TABLE user_workspaces DROP COLUMN IF EXISTS total_size_bytes;
ALTER TABLE user_workspaces DROP COLUMN IF EXISTS file_count;
ALTER TABLE user_workspaces DROP COLUMN IF EXISTS last_synced_at;
