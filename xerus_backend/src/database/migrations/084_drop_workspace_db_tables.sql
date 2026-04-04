-- Migration: 084_drop_workspace_db_tables.sql
-- Description: Drop collaboration tables migrated to workspace SQLite DB
--
-- Context: These 6 tables were migrated from Neon to workspace.db (SQLite on
-- Daytona sandbox) as part of the workspace-first architecture. All API routes
-- now query workspace.db via provider.executeCommand(). No backend code queries
-- these Neon tables anymore.
--
-- Migrated tables:
--   channels, channel_messages, domains -> company-workspace-db.service.ts
--   tasks -> task-workspace-db.service.ts
--   inbox_items -> inbox-workspace-db.service.ts
--   skill_secrets -> secrets-workspace-db.service.ts
--
-- Also dropping:
--   conversations -> already on workspace DB (workspace-db.service.ts)
--   channel_members -> junction table for channels (no longer queried)
--
-- Tables NOT touched (still on Neon):
--   users, user_api_keys, workspaces, agent_registry, model_registry,
--   execution_sessions, execution_pause_states, credit_transactions,
--   connected_accounts, pipedream_apps, pipedream_apps_sync,
--   trigger_providers, agent_triggers, invite_codes,
--   memory_search_index, tool_executions, tool_usage, migrations

BEGIN;

-- Drop child tables first (FK ordering)

-- tasks references channels(id)
DROP TABLE IF EXISTS tasks CASCADE;

-- channel_messages references channels(id)
DROP TABLE IF EXISTS channel_messages CASCADE;

-- channel_members references channels(slug) - junction table
DROP TABLE IF EXISTS channel_members CASCADE;

-- channels references domains(id)
DROP TABLE IF EXISTS channels CASCADE;

-- domains references users(user_id) and workspaces(id)
DROP TABLE IF EXISTS domains CASCADE;

-- inbox_items references users(user_id)
DROP TABLE IF EXISTS inbox_items CASCADE;

-- skill_secrets (standalone after skill table cleanup in 077)
DROP TABLE IF EXISTS skill_secrets CASCADE;

-- conversations (standalone, already on workspace DB)
DROP TABLE IF EXISTS conversations CASCADE;

-- Drop orphaned triggers for dropped tables
DROP TRIGGER IF EXISTS set_domains_updated_at ON domains;
DROP TRIGGER IF EXISTS set_channels_updated_at ON channels;
DROP TRIGGER IF EXISTS set_tasks_updated_at ON tasks;
DROP TRIGGER IF EXISTS set_inbox_items_updated_at ON inbox_items;
DROP TRIGGER IF EXISTS set_skill_secrets_updated_at ON skill_secrets;
DROP TRIGGER IF EXISTS set_conversations_updated_at ON conversations;

COMMIT;

-- Result: 8 tables dropped (tasks, channel_messages, channel_members,
-- channels, domains, inbox_items, skill_secrets, conversations).
--
-- Remaining Neon tables (~17): users, user_api_keys, workspaces,
-- agent_registry, model_registry, execution_sessions, execution_pause_states,
-- credit_transactions, connected_accounts, pipedream_apps, pipedream_apps_sync,
-- trigger_providers, agent_triggers, invite_codes, memory_search_index,
-- tool_executions, tool_usage, migrations
