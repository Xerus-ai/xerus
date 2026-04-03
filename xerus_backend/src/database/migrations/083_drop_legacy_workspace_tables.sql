-- Migration: 083_drop_legacy_workspace_tables.sql
-- Description: Drop deprecated workspace tables from the CLI-native pivot
--
-- Context: Migration 081 (2026-03-28) renamed 6 heartbeat/snapshot/hook tables
-- to _deprecated_* with a 30-day burn-in period. That period has now expired.
-- This migration permanently drops those tables along with orphaned indexes,
-- triggers, and functions that reference tables already removed in earlier
-- migrations (055, 068, 077, 081).
--
-- Tables still actively queried (NOT touched by this migration):
--   conversations, tasks, inbox_items, skill_secrets, tool_executions,
--   tool_usage, agent_registry, domains, channels, channel_messages,
--   execution_sessions, execution_pause_states, agent_triggers
--
-- Rollback: These tables contained no data after the CLI-native pivot moved
-- all workspace state to the Daytona sandbox filesystem. To recreate them,
-- re-run migrations 021 (heartbeat/snapshot), 022 (hook_executions), and
-- the relevant ALTER TABLE statements from migrations 054, 056, 064, 069, 071.

BEGIN;

-- =============================================================================
-- Phase 1: Drop deprecated heartbeat tables (renamed in migration 081)
-- Original domain: src/domains/heartbeat/ (deleted, replaced by 9to5 on sandbox)
-- =============================================================================

-- Drop triggers first (they reference the renamed tables)
DROP TRIGGER IF EXISTS set_heartbeat_configs_updated_at ON _deprecated_heartbeat_configs;
DROP TRIGGER IF EXISTS set_heartbeat_state_updated_at ON _deprecated_heartbeat_state;
DROP TRIGGER IF EXISTS set_snapshot_configs_updated_at ON _deprecated_snapshot_configs;

-- Child tables first (heartbeat_executions -> heartbeat_configs FK)
DROP TABLE IF EXISTS _deprecated_heartbeat_executions CASCADE;
DROP TABLE IF EXISTS _deprecated_heartbeat_state CASCADE;
DROP TABLE IF EXISTS _deprecated_heartbeat_configs CASCADE;

-- =============================================================================
-- Phase 2: Drop deprecated snapshot tables (renamed in migration 081)
-- Original domain: src/domains/heartbeat/ (snapshot was part of heartbeat)
-- =============================================================================

-- Child table first (snapshot_executions -> snapshot_configs FK)
DROP TABLE IF EXISTS _deprecated_snapshot_executions CASCADE;
DROP TABLE IF EXISTS _deprecated_snapshot_configs CASCADE;

-- =============================================================================
-- Phase 3: Drop deprecated hook_executions (renamed in migration 081)
-- runner-event-router.ts confirmed: "hook_executions table deprecated in
-- migration 081. Log only."
-- =============================================================================

DROP TABLE IF EXISTS _deprecated_hook_executions CASCADE;

-- =============================================================================
-- Phase 4: Drop orphaned functions
-- These functions were created for tables that no longer exist.
-- update_updated_at_column() is NOT dropped — still used by live tables
-- (workspaces, memory_search_index, domains, channels, tasks, etc.)
-- =============================================================================

-- update_execution_lanes_timestamp: target table execution_lanes dropped in 081
DROP FUNCTION IF EXISTS update_execution_lanes_timestamp();

-- update_subagent_runs_timestamp: target table subagent_runs dropped in 081
DROP FUNCTION IF EXISTS update_subagent_runs_timestamp();

-- update_agents_timestamp: target table agents dropped in 055
DROP FUNCTION IF EXISTS update_agents_timestamp();

-- update_agent_success_rate: target table agents dropped in 055
DROP FUNCTION IF EXISTS update_agent_success_rate();

-- =============================================================================
-- Phase 5: Drop orphaned indexes (safety net)
-- CASCADE on the table drops should have handled these, but explicit cleanup
-- catches any that survived due to the RENAME approach in migration 081.
-- =============================================================================

-- Heartbeat indexes (originally on heartbeat_configs, now _deprecated_*)
DROP INDEX IF EXISTS idx_heartbeat_configs_agent_id;
DROP INDEX IF EXISTS idx_heartbeat_configs_user_id;
DROP INDEX IF EXISTS idx_heartbeat_configs_enabled;
DROP INDEX IF EXISTS idx_heartbeat_configs_agent_slug;

-- Heartbeat state indexes
DROP INDEX IF EXISTS idx_heartbeat_state_agent_id;
DROP INDEX IF EXISTS idx_heartbeat_state_next_scheduled;
DROP INDEX IF EXISTS idx_heartbeat_state_agent_slug;

-- Heartbeat execution indexes
DROP INDEX IF EXISTS idx_heartbeat_executions_config_id;
DROP INDEX IF EXISTS idx_heartbeat_executions_agent_id;
DROP INDEX IF EXISTS idx_heartbeat_executions_scheduled_at;
DROP INDEX IF EXISTS idx_heartbeat_executions_status;
DROP INDEX IF EXISTS idx_heartbeat_executions_created_at;

-- Snapshot indexes
DROP INDEX IF EXISTS idx_snapshot_configs_agent_id;
DROP INDEX IF EXISTS idx_snapshot_executions_agent_id;
DROP INDEX IF EXISTS idx_snapshot_executions_created_at;

-- Hook execution indexes
DROP INDEX IF EXISTS idx_hook_executions_execution_id;
DROP INDEX IF EXISTS idx_hook_executions_hook_event;
DROP INDEX IF EXISTS idx_hook_executions_agent_id;
DROP INDEX IF EXISTS idx_hook_executions_user_id;
DROP INDEX IF EXISTS idx_hook_executions_created;
DROP INDEX IF EXISTS idx_hook_executions_blocked;
DROP INDEX IF EXISTS idx_hook_executions_agent_slug;

COMMIT;

-- Result: 6 deprecated tables dropped, 4 orphaned functions dropped,
-- ~20 orphaned indexes cleaned up.
--
-- Remaining platform tables (~25): users, user_api_keys, workspaces,
-- user_workspaces, sandbox_registry, agent_registry, conversations,
-- execution_sessions, execution_pause_states, credit_transactions,
-- model_registry, trigger_providers, agent_triggers, invite_codes,
-- connected_accounts, pipedream_apps, pipedream_apps_sync,
-- memory_search_index, domains, channels, channel_messages,
-- inbox_items, tasks, skill_secrets, tool_executions, tool_usage
