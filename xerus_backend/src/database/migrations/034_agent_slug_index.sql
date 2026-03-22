-- Expression index for agent slug lookups
-- Enables index usage for: WHERE LOWER(REPLACE(name, ' ', '-')) = $1
-- Used by: chat-execution.repository.ts resolveAgentBySlug()

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agents_name_slug
ON agents (LOWER(REPLACE(name, ' ', '-')));
