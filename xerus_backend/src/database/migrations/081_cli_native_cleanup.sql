-- CLI-Native Pivot: Deprecate tables with ZERO active queries after pivot
--
-- Verified by grepping all production .ts files for FROM/INTO/UPDATE on each table.
-- Only tables with NO remaining production queries are deprecated.
-- Uses RENAME instead of DROP for a 30-day burn-in safety period.
--
-- Tables still actively queried (25): users, user_api_keys, workspaces,
-- agent_registry, conversations, execution_sessions, credit_transactions,
-- model_registry, memory_search_index, invite_codes, pipedream_apps,
-- pipedream_apps_sync, connected_accounts, trigger_providers, migrations,
-- channels, channel_messages, domains, inbox_items, tasks, skill_secrets,
-- execution_pause_states, agent_triggers, user_native_connections,
-- user_pipedream_connections
--
-- Tables kept for billing: tool_usage, tool_executions

-- Phase 1: Deprecate heartbeat tables (domain deleted, 9to5 replaces)
-- Deprecated tables. Safe to DROP after 30-day burn-in period.
ALTER TABLE IF EXISTS heartbeat_executions RENAME TO _deprecated_heartbeat_executions;
ALTER TABLE IF EXISTS heartbeat_state RENAME TO _deprecated_heartbeat_state;
ALTER TABLE IF EXISTS heartbeat_configs RENAME TO _deprecated_heartbeat_configs;
ALTER TABLE IF EXISTS snapshot_executions RENAME TO _deprecated_snapshot_executions;
ALTER TABLE IF EXISTS snapshot_configs RENAME TO _deprecated_snapshot_configs;

-- Phase 2: Deprecate execution audit tables (no production queries remain)
-- Deprecated tables. Safe to DROP after 30-day burn-in period.
ALTER TABLE IF EXISTS hook_executions RENAME TO _deprecated_hook_executions;

-- Phase 3: tool_usage and tool_executions are NOT deprecated.
-- Credits/billing still uses tool_usage (see credits/usage-store.ts).

-- Phase 4: Drop tables that don't exist in Neon but were in earlier migrations
-- (safe no-ops, just cleanup)
DROP TABLE IF EXISTS subagent_runs CASCADE;
DROP TABLE IF EXISTS chat_executions CASCADE;
DROP TABLE IF EXISTS session_checkpoints CASCADE;
DROP TABLE IF EXISTS execution_queue CASCADE;
DROP TABLE IF EXISTS execution_lanes CASCADE;
DROP TABLE IF EXISTS agent_tools CASCADE;
DROP TABLE IF EXISTS agent_knowledge_bases CASCADE;
DROP TABLE IF EXISTS agent_skills CASCADE;
DROP TABLE IF EXISTS channel_knowledge_bases CASCADE;
DROP TABLE IF EXISTS domain_knowledge_bases CASCADE;
DROP TABLE IF EXISTS channel_members CASCADE;
DROP TABLE IF EXISTS memory_evolution_history CASCADE;
DROP TABLE IF EXISTS memory_evolution_log CASCADE;
DROP TABLE IF EXISTS discovered_patterns CASCADE;
DROP TABLE IF EXISTS agent_outputs CASCADE;
DROP TABLE IF EXISTS skills CASCADE;
DROP TABLE IF EXISTS ace_playbook CASCADE;

-- Result: 33 tables -> 25 tables (6 renamed/deprecated, 2 kept for billing, rest were no-ops)
-- Future: channels, domains, channel_messages, inbox_items, tasks, skill_secrets
-- will migrate to sandbox filesystem when those domains are refactored.
