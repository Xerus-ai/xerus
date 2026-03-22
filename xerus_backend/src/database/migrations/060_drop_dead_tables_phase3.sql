-- Migration 060: Drop dead tables (Phase 3)
-- These tables have zero SQL references in active backend code.
-- Verified via full codebase grep excluding migrations/.

-- Pre-Pipedream tool design (superseded by Pipedream SDK live API)
DROP TABLE IF EXISTS tool_actions CASCADE;

-- Pre-Pipedream OAuth storage (superseded by connected_accounts + user_pipedream_connections)
DROP TABLE IF EXISTS user_credentials CASCADE;

-- Channel members (created but never queried)
DROP TABLE IF EXISTS channel_members CASCADE;

-- Chat executions (migration 029, never used)
DROP TABLE IF EXISTS chat_executions CASCADE;

-- RAG chunks (removed — KB docs mounted as files, agent uses Read/Grep natively)
DROP TABLE IF EXISTS document_chunks CASCADE;

-- Execution steps (never referenced)
DROP TABLE IF EXISTS execution_steps CASCADE;

-- Folders (never referenced)
DROP TABLE IF EXISTS folders CASCADE;

-- Guest config (never referenced)
DROP TABLE IF EXISTS guest_config CASCADE;

-- Knowledge base table (KBs moved to config.json filesystem)
DROP TABLE IF EXISTS knowledge_base CASCADE;

-- MCP sessions (never referenced)
DROP TABLE IF EXISTS mcp_sessions CASCADE;

-- Memory sharing rules (memory moved to git-based .memory/)
DROP TABLE IF EXISTS memory_sharing_rules CASCADE;

-- Schedule executions (never referenced)
DROP TABLE IF EXISTS schedule_executions CASCADE;

-- Team checkpoints (SDK native teams, no DB needed)
DROP TABLE IF EXISTS team_checkpoints CASCADE;

-- Teams table (SDK native teams, no DB needed)
DROP TABLE IF EXISTS teams CASCADE;

-- Workflow definitions (never referenced)
DROP TABLE IF EXISTS workflow_definitions CASCADE;

-- Working memory table (memory moved to git-based .memory/)
DROP TABLE IF EXISTS working_memory CASCADE;

-- ACE state (replaced by git-based .memory/ + no-op stub in session hooks)
DROP TABLE IF EXISTS ace_state CASCADE;

-- Agent outputs (no routes/consumers, output tracked via Drive filesystem)
DROP TABLE IF EXISTS agent_outputs CASCADE;

-- ACE playbook (moved to git-based .memory/ filesystem)
DROP TABLE IF EXISTS ace_playbook CASCADE;
