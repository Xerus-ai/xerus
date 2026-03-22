-- Migration 057: Drop remaining dead tables (Phase 2)
-- These tables have zero active references in the codebase.
-- Identified by dead-table scan after Phase 1 cleanup.

DROP TABLE IF EXISTS artifacts CASCADE;
DROP TABLE IF EXISTS execution_results CASCADE;
DROP TABLE IF EXISTS knowledge_queries CASCADE;
DROP TABLE IF EXISTS learning_outcomes CASCADE;
DROP TABLE IF EXISTS procedural_memory CASCADE;
DROP TABLE IF EXISTS scheduled_executions_backup CASCADE;
DROP TABLE IF EXISTS schedules CASCADE;
DROP TABLE IF EXISTS shared_knowledge CASCADE;
DROP TABLE IF EXISTS subagent_runs CASCADE;
DROP TABLE IF EXISTS team_members CASCADE;
DROP TABLE IF EXISTS ace_reflections CASCADE;
