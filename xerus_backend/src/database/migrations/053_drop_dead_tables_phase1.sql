-- Migration 053: Phase 1 - Drop dead tables (sandbox-sovereign migration)
--
-- These tables are genuinely dead - no active code reads or writes to them:
--   agent_runs: Superseded by execution_sessions for billing/history
--   tool_executions: Never wired into application code
--   chat_executions: Chat module deleted (frontend never called /chat/* endpoints)
--   agent_outputs: Never wired into application code
--   channel_members: Never populated or queried
--
-- Tables NOT dropped (still have active code paths):
--   ace_playbook: ACE module still reads from DB (Phase 1.3 will migrate to filesystem)
--   agent_knowledge_bases: Frontend calls /agents/:id/knowledge-bases
--   agent_tools: Frontend calls /agents/:id/tools
--   agent_skills: Frontend calls /agents/:id/skills
--   inbox_items: Active UI state

-- ===== DROP DEAD TABLES =====

DROP TABLE IF EXISTS agent_runs CASCADE;
DROP TABLE IF EXISTS tool_executions CASCADE;
DROP TABLE IF EXISTS chat_executions CASCADE;
DROP TABLE IF EXISTS agent_outputs CASCADE;
DROP TABLE IF EXISTS channel_members CASCADE;
