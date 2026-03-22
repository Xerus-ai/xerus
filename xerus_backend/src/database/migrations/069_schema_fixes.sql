-- Migration: 069_schema_fixes.sql
-- Description: Fix CHECK constraint on hook_executions, add feedback column to execution_pause_states
-- Depends: 022_execution_domain.sql

-- ===== 1. FIX hook_executions.hook_event CHECK constraint =====
-- Add missing values: 'SubagentStart', 'PermissionRequest'

ALTER TABLE hook_executions DROP CONSTRAINT IF EXISTS hook_executions_event_check;
ALTER TABLE hook_executions ADD CONSTRAINT hook_executions_event_check CHECK (hook_event IN (
    'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
    'PreCompact', 'SessionEnd', 'Stop', 'SubagentStop', 'Notification',
    'TeammateIdle', 'TaskCompleted', 'SubagentStart', 'PermissionRequest'
));

-- ===== 2. ADD feedback column to execution_pause_states =====
-- hitl-pause.repository.ts accepts feedback but never persists it.
-- Adding a TEXT column so the resolve query can store user feedback.

ALTER TABLE execution_pause_states ADD COLUMN IF NOT EXISTS feedback TEXT;

COMMENT ON COLUMN execution_pause_states.feedback IS 'Optional user feedback when resolving a HITL pause (e.g. rejection reason)';
