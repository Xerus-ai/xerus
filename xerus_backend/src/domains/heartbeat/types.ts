// Heartbeat Domain Types
// Types for heartbeat configuration and execution tracking

// -----------------------------------------------------------------------------
// Heartbeat Status Types
// -----------------------------------------------------------------------------

export const HEARTBEAT_EXECUTION_STATUSES = [
    'queued',
    'running',
    'completed',
    'failed',
    'skipped',
    'suppressed',
] as const;

export type HeartbeatExecutionStatus = (typeof HEARTBEAT_EXECUTION_STATUSES)[number];

export const HEARTBEAT_OUTCOMES = ['success', 'failure', 'timeout', 'suppressed', 'skipped'] as const;

export type HeartbeatOutcome = (typeof HEARTBEAT_OUTCOMES)[number];

export const HEARTBEAT_TRIGGER_TYPES = ['scheduled', 'event', 'manual'] as const;

export type HeartbeatTriggerType = (typeof HEARTBEAT_TRIGGER_TYPES)[number];

// -----------------------------------------------------------------------------
// Heartbeat Config (from heartbeat_configs table)
// -----------------------------------------------------------------------------

export interface HeartbeatConfig {
    id: number;
    agent_id: number;
    user_id: string;
    enabled: boolean;
    cron_expression: string;
    timezone: string;
    active_hours_start: string | null;
    active_hours_end: string | null;
    weekdays_only: boolean;
    prompt: string | null;
    max_duration_seconds: number;
    retry_on_failure: boolean;
    token_budget: number;
    event_token_budget: number;
    max_alerts_per_hour: number;
    suppress_token: string;
    tool_allowlist: string[] | null;
    default_channel_id: string | null;
    stagger_offset_ms: number;
    created_at: Date;
    updated_at: Date;
}

export interface HeartbeatConfigRow {
    id: number;
    agent_id: number;
    user_id: string;
    enabled: boolean;
    cron_expression: string;
    timezone: string;
    active_hours_start: string | null;
    active_hours_end: string | null;
    weekdays_only: boolean;
    prompt: string | null;
    max_duration_seconds: number;
    retry_on_failure: boolean;
    token_budget: number;
    event_token_budget: number;
    max_alerts_per_hour: number;
    suppress_token: string;
    tool_allowlist: string[] | null;
    default_channel_id: string | null;
    stagger_offset_ms: number;
    created_at: Date;
    updated_at: Date;
}

// -----------------------------------------------------------------------------
// Heartbeat Config Create/Update DTOs
// -----------------------------------------------------------------------------

export interface CreateHeartbeatConfigDTO {
    agent_id: number;
    user_id: string;
    enabled?: boolean;
    cron_expression?: string;
    timezone?: string;
    active_hours_start?: string | null;
    active_hours_end?: string | null;
    weekdays_only?: boolean;
    prompt?: string | null;
    max_duration_seconds?: number;
    retry_on_failure?: boolean;
    token_budget?: number;
    event_token_budget?: number;
    max_alerts_per_hour?: number;
    suppress_token?: string;
    tool_allowlist?: string[] | null;
    default_channel_id?: string | null;
    stagger_offset_ms?: number;
}

export interface UpdateHeartbeatConfigDTO {
    enabled?: boolean;
    cron_expression?: string;
    timezone?: string;
    active_hours_start?: string | null;
    active_hours_end?: string | null;
    weekdays_only?: boolean;
    prompt?: string | null;
    max_duration_seconds?: number;
    retry_on_failure?: boolean;
    token_budget?: number;
    event_token_budget?: number;
    max_alerts_per_hour?: number;
    suppress_token?: string;
    tool_allowlist?: string[] | null;
    default_channel_id?: string | null;
    stagger_offset_ms?: number;
}

// -----------------------------------------------------------------------------
// Heartbeat Execution (from heartbeat_executions table)
// -----------------------------------------------------------------------------

export interface HeartbeatExecution {
    id: string;
    heartbeat_config_id: number | null;
    agent_id: number;
    trigger_type: HeartbeatTriggerType;
    trigger_id: number | null;
    event_payload: Record<string, unknown> | null;
    snapshot_execution_id: string | null;
    scheduled_at: Date;
    started_at: Date | null;
    completed_at: Date | null;
    status: HeartbeatExecutionStatus;
    outcome: HeartbeatOutcome | null;
    result: Record<string, unknown> | null;
    error_message: string | null;
    duration_ms: number | null;
    tokens_used: number;
    tool_calls_count: number;
    inbox_posts: number;
    memory_updates: number;
    alerts_sent: number;
    run_id: string | null;
    created_at: Date;
}

export interface HeartbeatExecutionRow {
    id: string;
    heartbeat_config_id: number | null;
    agent_id: number;
    trigger_type: string;
    trigger_id: number | null;
    event_payload: Record<string, unknown> | null;
    snapshot_execution_id: string | null;
    scheduled_at: Date;
    started_at: Date | null;
    completed_at: Date | null;
    status: string;
    outcome: string | null;
    result: Record<string, unknown> | null;
    error_message: string | null;
    duration_ms: number | null;
    tokens_used: number;
    tool_calls_count: number;
    inbox_posts: number;
    memory_updates: number;
    alerts_sent: number;
    run_id: string | null;
    created_at: Date;
}

// -----------------------------------------------------------------------------
// Heartbeat Execution Create DTO
// -----------------------------------------------------------------------------

export interface CreateHeartbeatExecutionDTO {
    heartbeat_config_id?: number | null;
    agent_id: number;
    trigger_type: HeartbeatTriggerType;
    trigger_id?: number | null;
    event_payload?: Record<string, unknown> | null;
    snapshot_execution_id?: string | null;
    scheduled_at: Date;
    run_id?: string | null;
}

// -----------------------------------------------------------------------------
// Pagination Types
// -----------------------------------------------------------------------------

export interface HeartbeatExecutionListOptions {
    limit?: number;
    offset?: number;
    status?: HeartbeatExecutionStatus;
}

export interface PaginatedHeartbeatExecutions {
    executions: HeartbeatExecution[];
    total: number;
    limit: number;
    offset: number;
}

// -----------------------------------------------------------------------------
// Heartbeat State (from heartbeat_state table - runtime execution state)
// -----------------------------------------------------------------------------

export interface HeartbeatState {
    id: number;
    agent_id: number;
    last_run_at: Date | null;
    last_outcome: HeartbeatOutcome | null;
    last_snapshot_hash: string | null;
    consecutive_failures: number;
    tokens_spent_today: number;
    tokens_budget_today: number;
    last_processed_ids: Record<string, string>;
    current_focus: string | null;
    paused_execution_id: string | null;
    next_scheduled_at: Date | null;
    suppressed_until: Date | null;
    last_error: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface HeartbeatStateRow {
    id: number;
    agent_id: number;
    last_run_at: Date | null;
    last_outcome: string | null;
    last_snapshot_hash: string | null;
    consecutive_failures: number;
    tokens_spent_today: number;
    tokens_budget_today: number;
    last_processed_ids: Record<string, string>;
    current_focus: string | null;
    paused_execution_id: string | null;
    next_scheduled_at: Date | null;
    suppressed_until: Date | null;
    last_error: string | null;
    created_at: Date;
    updated_at: Date;
}

// -----------------------------------------------------------------------------
// Heartbeat Runner Types
// -----------------------------------------------------------------------------

export interface HeartbeatRunResult {
    agent_id: number;
    trigger_type: HeartbeatTriggerType;
    run_id: string;
    skipped: boolean;
    skip_reason?: string;
    execution_id?: string;
}

