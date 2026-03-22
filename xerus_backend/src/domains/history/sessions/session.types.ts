// Execution Session Types
// Database row types for execution_sessions and hook_executions tables
// Matches: migration 022_execution_domain.sql

import type { ExecutionStatus, PauseReason, PauseResolution } from '../../../shared/types/execution-shared.types';
import type { HookEvent } from '../../execution/hooks/hooks.types';

// Re-export PauseReason and PauseResolution for backward compatibility
export type { PauseReason, PauseResolution } from '../../../shared/types/execution-shared.types';

// -----------------------------------------------------------------------------
// Execution Session (DB Row)
// Matches: execution_sessions table
// -----------------------------------------------------------------------------

type SessionTriggerType = 'manual' | 'scheduled' | 'webhook' | 'event' | 'heartbeat';

export interface ExecutionSessionRow {
    id: string;
    workspace_id: string;
    agent_slug: string;
    sandbox_id: string | null;
    status: ExecutionStatus;
    trigger_type: SessionTriggerType | null;
    input_tokens: number | null;
    output_tokens: number | null;
    credits_used: number | null;
    started_at: Date | null;
    completed_at: Date | null;
    created_at: Date;
}

export interface CreateExecutionSessionDTO {
    workspace_id: string;
    agent_slug: string;
    sandbox_id?: string | null;
    trigger_type?: SessionTriggerType | null;
}

export interface UpdateExecutionSessionDTO {
    sandbox_id?: string | null;
    status?: ExecutionStatus;
    input_tokens?: number | null;
    output_tokens?: number | null;
    credits_used?: number | null;
    started_at?: Date | null;
    completed_at?: Date | null;
}

// -----------------------------------------------------------------------------
// Hook Execution (DB Row)
// Matches: hook_executions table
// Audit log for SDK hook invocations
// -----------------------------------------------------------------------------

export interface HookExecutionRow {
    id: string;
    execution_id: string;
    hook_event: HookEvent;
    agent_slug: string;
    user_id: string;
    payload: Record<string, unknown> | null;
    result: Record<string, unknown> | null;
    blocked: boolean;
    duration_ms: number | null;
    created_at: Date;
}

export interface CreateHookExecutionDTO {
    execution_id: string;
    hook_event: HookEvent;
    agent_slug: string;
    user_id: string;
    payload?: Record<string, unknown> | null;
}

export interface UpdateHookExecutionDTO {
    result?: Record<string, unknown> | null;
    blocked?: boolean;
    duration_ms?: number | null;
}

// -----------------------------------------------------------------------------
// Execution Pause State (DB Row)
// Matches: execution_pause_states table
// HITL pause states for user approval workflows
// -----------------------------------------------------------------------------

export interface ExecutionPauseStateRow {
    id: string;
    execution_id: string;
    paused_at: Date;
    reason: PauseReason;
    request_data: Record<string, unknown> | null;
    resolved_at: Date | null;
    resolution: PauseResolution | null;
    resolved_by: string | null;
}

export interface CreatePauseStateDTO {
    execution_id: string;
    reason: PauseReason;
    request_data?: Record<string, unknown> | null;
}

export interface ResolvePauseStateDTO {
    resolution: PauseResolution;
    resolved_by: string;
}
