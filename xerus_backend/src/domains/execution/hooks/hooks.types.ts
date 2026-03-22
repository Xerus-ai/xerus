// Hooks System Types
// Types for SDK hook input/output and handler signatures

import { PermissionMode } from '../types';

// -----------------------------------------------------------------------------
// Hook Events (15 total: 13 core + 2 team-specific)
// -----------------------------------------------------------------------------

export const HOOK_EVENTS = [
    'SessionStart',
    'UserPromptSubmit',
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'PreCompact',
    'SessionEnd',
    'Stop',
    'SubagentStop',
    'SubagentStart',
    'Notification',
    'PermissionRequest',
    'Setup',
    'TeammateIdle',
    'TaskCompleted',
] as const;

export type HookEvent = (typeof HOOK_EVENTS)[number];

// Core 13 SDK hooks (always available)
export const CORE_HOOK_EVENTS: readonly HookEvent[] = [
    'SessionStart',
    'UserPromptSubmit',
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'PreCompact',
    'SessionEnd',
    'Stop',
    'SubagentStop',
    'SubagentStart',
    'Notification',
    'PermissionRequest',
    'Setup',
] as const;

// Team-specific hooks (only for SDK teams)
export const TEAM_HOOK_EVENTS: readonly HookEvent[] = ['TeammateIdle', 'TaskCompleted'] as const;

// -----------------------------------------------------------------------------
// Base Hook Input (shared by all hooks)
// -----------------------------------------------------------------------------

export interface BaseHookInput {
    session_id: string;
    transcript_path: string;
    cwd: string;
    permission_mode?: PermissionMode;
}

// -----------------------------------------------------------------------------
// Event-Specific Hook Inputs
// -----------------------------------------------------------------------------

export interface SessionStartInput extends BaseHookInput {
    agent_id: string;
    user_id: string;
    trigger_type: string;
}

export interface UserPromptSubmitInput extends BaseHookInput {
    prompt: string;
    agent_id: string;
    user_id: string;
    trigger_type: string;
}

export interface PreToolUseInput extends BaseHookInput {
    tool_name: string;
    tool_input: Record<string, unknown>;
    agent_id: string;
    user_id: string;
}

export interface PostToolUseInput extends PreToolUseInput {
    tool_result: unknown;
    duration_ms: number;
    success: boolean;
    tokens_used?: number;
}

export interface PreCompactInput extends BaseHookInput {
    context_usage_percent: number;
    current_todos?: unknown[];
    key_decisions?: string[];
    open_issues?: string[];
    working_memory_summary?: string;
}

export interface SessionEndInput extends BaseHookInput {
    agent_id: string;
    user_id: string;
    session_summary?: string;
    learnings?: string[];
    memory_updates?: Record<string, unknown>[];
    will_pause?: boolean;
    checkpoint?: unknown;
    final_response?: string;
    tool_calls?: unknown[];
    usage?: { input_tokens: number; output_tokens: number };
}

export interface StopInput extends BaseHookInput {
    execution_id: string;
    stop_reason: 'user_cancel' | 'timeout' | 'error' | 'complete';
    has_unsaved_memory?: boolean;
    partial_output?: string;
    task_title?: string;
}

export interface PostToolUseFailureInput extends BaseHookInput {
    tool_name: string;
    tool_input: Record<string, unknown>;
    agent_id: string;
    user_id: string;
    error_message: string;
    error_code?: string;
    duration_ms: number;
}

export interface SubagentStopInput extends BaseHookInput {
    subagent_type: string;
    result: unknown;
    duration_ms: number;
    success: boolean;
    tokens_used?: number;
    error?: string;
}

export interface SubagentStartInput extends BaseHookInput {
    subagent_type: string;
    subagent_id: string;
    parent_agent_id: string;
    task_description?: string;
}

export interface NotificationInput extends BaseHookInput {
    notification_type: string;
    message: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    details?: string;
    action_required?: boolean;
}

export interface PermissionRequestInput extends BaseHookInput {
    tool_name: string;
    tool_input: Record<string, unknown>;
    agent_id: string;
    user_id: string;
    permission_type: string;
    reason?: string;
}

export interface SetupInput extends BaseHookInput {
    agent_id: string;
    user_id: string;
    workspace_path: string;
    is_first_session: boolean;
}

export interface TeammateIdleInput extends BaseHookInput {
    teammate_id: string;
    teammate_name: string;
    last_task_id?: string;
    output_summary?: string;
}

export interface TaskCompletedInput extends BaseHookInput {
    task_id: string;
    task_title: string;
    completed_by: string;
    deliverables?: string[];
}

// Union type for all hook inputs
export type HookInput =
    | SessionStartInput
    | UserPromptSubmitInput
    | PreToolUseInput
    | PostToolUseInput
    | PostToolUseFailureInput
    | PreCompactInput
    | SessionEndInput
    | StopInput
    | SubagentStopInput
    | SubagentStartInput
    | NotificationInput
    | PermissionRequestInput
    | SetupInput
    | TeammateIdleInput
    | TaskCompletedInput;

// -----------------------------------------------------------------------------
// Hook Results
// -----------------------------------------------------------------------------

type PreToolUseDecision = 'allow' | 'deny' | 'ask';

export interface PreToolUseOutput {
    hook_event_name: 'PreToolUse';
    permission_decision: PreToolUseDecision;
    permission_decision_reason?: string;
    requires_auth?: boolean;
}

export interface TeammateIdleOutput {
    action: 'idle' | 'continue';
    feedback?: string;
}

export interface TaskCompletedOutput {
    action: 'accept' | 'reject';
    feedback?: string;
}

export interface PostToolUseOutput {
    additional_context?: string;
    threshold_level?: string;
    tokens_used?: number;
}

export interface HookResult {
    success: boolean;
    hook_specific_output?: PreToolUseOutput | TeammateIdleOutput | TaskCompletedOutput | PostToolUseOutput;
    error?: string;
}

// -----------------------------------------------------------------------------
// Hook Handler Type
// -----------------------------------------------------------------------------

export type HookHandler<T extends BaseHookInput = BaseHookInput> = (input: T) => Promise<HookResult>;

// Type-safe handler map
export type HookHandlerMap = {
    SessionStart?: HookHandler<SessionStartInput>[];
    UserPromptSubmit?: HookHandler<UserPromptSubmitInput>[];
    PreToolUse?: HookHandler<PreToolUseInput>[];
    PostToolUse?: HookHandler<PostToolUseInput>[];
    PostToolUseFailure?: HookHandler<PostToolUseFailureInput>[];
    PreCompact?: HookHandler<PreCompactInput>[];
    SessionEnd?: HookHandler<SessionEndInput>[];
    Stop?: HookHandler<StopInput>[];
    SubagentStop?: HookHandler<SubagentStopInput>[];
    SubagentStart?: HookHandler<SubagentStartInput>[];
    Notification?: HookHandler<NotificationInput>[];
    PermissionRequest?: HookHandler<PermissionRequestInput>[];
    Setup?: HookHandler<SetupInput>[];
    TeammateIdle?: HookHandler<TeammateIdleInput>[];
    TaskCompleted?: HookHandler<TaskCompletedInput>[];
};

// -----------------------------------------------------------------------------
// Agent and Trigger Context (for building hooks)
// -----------------------------------------------------------------------------

export interface HookAgentContext {
    agent_id: string;
    slug: string;
    user_id: string;
    autonomy_level: string;
    capabilities: {
        tools: string[];
    };
    primary_channel_id?: string;
}

export interface HookTriggerContext {
    trigger_type: string;
    payload: Record<string, unknown>;
    schedule_id?: string;
    team_id?: string;
    mention_id?: string;
}

// -----------------------------------------------------------------------------
// Type Guards
// -----------------------------------------------------------------------------

export function isPreToolUseInput(input: BaseHookInput): input is PreToolUseInput {
    return 'tool_name' in input && 'tool_input' in input && !('tool_result' in input);
}

export function isPostToolUseInput(input: BaseHookInput): input is PostToolUseInput {
    return 'tool_name' in input && 'tool_input' in input && 'tool_result' in input;
}

export function isNotificationInput(input: BaseHookInput): input is NotificationInput {
    return 'notification_type' in input && 'message' in input;
}

export function isTeammateIdleInput(input: BaseHookInput): input is TeammateIdleInput {
    return 'teammate_id' in input && 'teammate_name' in input;
}

export function isTaskCompletedInput(input: BaseHookInput): input is TaskCompletedInput {
    return 'task_id' in input && 'task_title' in input && 'completed_by' in input;
}

export function isPostToolUseFailureInput(input: BaseHookInput): input is PostToolUseFailureInput {
    return 'tool_name' in input && 'error_message' in input;
}

export function isSubagentStartInput(input: BaseHookInput): input is SubagentStartInput {
    return 'subagent_type' in input && 'subagent_id' in input && 'parent_agent_id' in input;
}

export function isPermissionRequestInput(input: BaseHookInput): input is PermissionRequestInput {
    return 'tool_name' in input && 'permission_type' in input;
}

export function isSetupInput(input: BaseHookInput): input is SetupInput {
    return 'workspace_path' in input && 'is_first_session' in input;
}

export function isValidHookEvent(event: string): event is HookEvent {
    return HOOK_EVENTS.includes(event as HookEvent);
}
