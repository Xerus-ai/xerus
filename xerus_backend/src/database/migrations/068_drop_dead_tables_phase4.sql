-- Migration 068: Drop dead tables (Phase 4)
-- Drops connection tables with zero active consumers and session_checkpoints (dead code removed).

-- user_pipedream_connections: Only referenced by agent.registry.ts getUserPipedreamConnections()
-- which itself has zero callsites outside its own test file. Table is dead.
DROP TABLE IF EXISTS user_pipedream_connections CASCADE;

-- user_native_connections: Zero references in active code (only in trigger test setup).
DROP TABLE IF EXISTS user_native_connections CASCADE;

-- session_checkpoints: All session-persistence.* files deleted (zero external consumers).
DROP TABLE IF EXISTS session_checkpoints CASCADE;
