// Execution Domain Types
// Foundational types for agent execution orchestration

// -----------------------------------------------------------------------------
// Behaviour Configuration - imported from shared (single source of truth)
// Re-exported for backward compatibility with existing imports
// -----------------------------------------------------------------------------

export type { ThinkingLevel, AutonomyLevel, PermissionMode, AdapterType } from '../../shared/types/agent-shared.types';
export {
    THINKING_LEVELS,
    AUTONOMY_LEVELS,
    PERMISSION_MODES,
    PERMISSION_MAP,
    THINKING_TOKENS,
    DEFAULT_THINKING_LEVEL,
    DEFAULT_AUTONOMY_LEVEL,
    ADAPTER_TYPES,
    DEFAULT_ADAPTER_TYPE,
} from '../../shared/types/agent-shared.types';

import type { ThinkingLevel } from '../../shared/types/agent-shared.types';

export const COT_PROMPTS: Record<ThinkingLevel, string | null> = {
    low: null,
    medium: 'Before answering, briefly outline your reasoning approach.',
    high: 'Think step by step. Break the problem into parts, reason carefully about each, then synthesize your answer.',
};

// Native SDK tools that every agent needs regardless of config
// These must always be in allowed_tools so PreToolUse does not block them
export const NATIVE_SDK_TOOLS = [
    'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'Skill',
    'Task', 'Agent', 'WebSearch', 'WebFetch',
    'TodoWrite', 'AskUserQuestion', 'NotebookEdit', 'ToolSearch',
    'SendMessage', 'TaskList', 'TaskGet', 'TaskUpdate', 'TaskCreate',
] as const;


// -----------------------------------------------------------------------------
// Execution Status - imported from shared (single source of truth)
// Re-exported for backward compatibility
// -----------------------------------------------------------------------------

import type { ExecutionStatus as _ExecutionStatus } from '../../shared/types/execution-shared.types';
export type { ExecutionStatus } from '../../shared/types/execution-shared.types';
export { EXECUTION_STATUSES } from '../../shared/types/execution-shared.types';

// Local alias for use within this file
type ExecutionStatus = _ExecutionStatus;

// -----------------------------------------------------------------------------
// Stream Event Types (12 types from streaming.md)
// -----------------------------------------------------------------------------

export const STREAM_EVENT_TYPES = [
    'meta',
    'progress',
    'token',
    'tool_call',
    'tool_result',
    'reasoning',
    'memory_update',
    'kb_query',
    'self_moderation',
    'context_warning',
    'done',
    'stop',
    'guidance',
    'notification',
    'tool_auth_required',
    'subagent_start',
    'subagent_stop',
    'delegation',
    'file_changed',
] as const;

export type StreamEventType = (typeof STREAM_EVENT_TYPES)[number];

export interface StreamEvent {
    type: StreamEventType;
    success?: boolean;
    execution_id: string;
    content?: unknown;
    meta?: unknown;
    timestamp?: string;
}

// Stop event content structure
export interface StopEventContent {
    reason: 'user_cancel' | 'timeout' | 'error' | 'complete';
    task_title?: string;
    has_unsaved_memory?: boolean;
}

// -----------------------------------------------------------------------------
// Sandbox States (from IMPLEMENTATION_PLAN.md)
// -----------------------------------------------------------------------------

export const SANDBOX_STATES = ['paused', 'running', 'killed'] as const;

export type SandboxState = (typeof SANDBOX_STATES)[number];

// -----------------------------------------------------------------------------
// Coordination Modes - imported from shared (single source of truth)
// Re-exported for backward compatibility with existing imports
// -----------------------------------------------------------------------------

import type { CoordinationMode as _CoordinationMode } from '../../shared/types/execution-shared.types';
export type { CoordinationMode } from '../../shared/types/execution-shared.types';
export { COORDINATION_MODES } from '../../shared/types/execution-shared.types';

// Local alias for use within this file
type CoordinationMode = _CoordinationMode;

// -----------------------------------------------------------------------------
// Error Types (from execution-errors.md)
// Extended to support comprehensive error classification
// -----------------------------------------------------------------------------

export const ERROR_TYPES = [
    'timeout',        // Execution timed out
    'tool_error',     // Tool/action failed
    'llm_error',      // LLM/model error
    'context_overflow', // Context limit exceeded
    'user_cancel',    // User cancelled execution
    'auth_error',     // Authentication/authorization failed
    'validation_error', // Input validation failed
    'system_error',   // Internal system error
] as const;

export type ErrorType = (typeof ERROR_TYPES)[number];

// -----------------------------------------------------------------------------
// Runner Event Types (events emitted by StdoutEmitter, routed by runner-event-router)
// -----------------------------------------------------------------------------

const RUNNER_EVENT_TYPES = [
    'tool_call',
    'session_ended',
    'done',
    'session_completed',
    'credit_usage',
    'update_agent_run',
    'sse_forward',
    'metadata_sync',
    'create_inbox_item',
    'agent_message',
    'hook_log',
    'subagent_failure',
    'sandbox_lifecycle',
    'error',
    'agent_output',
    'trigger_indexing',
    'session_started',
    'session_analytics',
    'health',
    'sessions',
    'credit_check',
    'heartbeat_fired',
    'heartbeat_skipped',
    'ace_reflection',
    'skill_suggestion',
    'scaffold_complete',
    'push_notification',
    'delegation_record',
    'hitl_request',
] as const;

export type RunnerEventType = (typeof RUNNER_EVENT_TYPES)[number];

// -----------------------------------------------------------------------------
// Configuration Types
// -----------------------------------------------------------------------------

export interface ExecutionConfig {
    daytonaApiKey: string;
    daytonaApiUrl: string;
    s3Bucket: string;
    s3Region: string;
    openRouterApiKey: string;
    maxExecutionTimeMs: number;
    maxTokensPerExecution: number;
    maxToolCalls: number;
}

export interface SandboxConfig {
    userId: string;
    template: string;
    timeoutMs: number;
    idleTimeoutMs: number;
    envVars?: Record<string, string>;
}

export interface WorkspaceConfig {
    userId: string;
    agentSlug: string;
    basePath: string;
}

// -----------------------------------------------------------------------------
// Manifest Types (from IMPLEMENTATION_PLAN.md workspace section)
// -----------------------------------------------------------------------------

type ManifestEntryType =
    | 'task_start'
    | 'agent_spawn'
    | 'tool_call'
    | 'tool_result'
    | 'agent_complete'
    | 'output';

type OutputStrategy = 'inline' | 'compact' | 'pointer';

export interface ManifestEntry {
    ts: string;
    step: number;
    type: ManifestEntryType;
    task?: string;
    agent?: string;
    tool?: string;
    input?: unknown;
    output_path?: string;
    summary?: string;
    strategy?: OutputStrategy;
    path?: string;
    content?: string;
    size?: number;
}

// -----------------------------------------------------------------------------
// Request/Response Types
// -----------------------------------------------------------------------------

export interface ExecutionRequest {
    agentSlug: string;
    task: string;
    userId: string;
    teamId?: number;
    context?: Record<string, unknown>;
    coordinationMode?: CoordinationMode;
    conversationId?: string;
}

export interface ExecutionErrorInfo {
    message: string;
    code: string;
    type: ErrorType;
    details?: Record<string, unknown>;
}

export type BillingType = 'byok' | 'platform';

export interface ExecutionSummary {
    totalTokens: number;
    durationMs: number;
    toolCalls: number;
    agentsUsed: number;
    artifacts?: string[];
    billingType?: BillingType;
}

export interface ExecutionResult {
    executionId: string;
    status: ExecutionStatus;
    success: boolean;
    finalResponse?: string;
    error?: ExecutionErrorInfo;
    summary: ExecutionSummary;
    databaseUpdated?: boolean;
}

// -----------------------------------------------------------------------------
// Stream Event Content Types (for specific event types)
// -----------------------------------------------------------------------------

export interface MetaEventContent {
    model: string;
    agentSlug: string;
    agentName: string;
    startedAt: string;
    runId?: number;
}

export interface ProgressEventContent {
    phase: string;
    message: string;
    percent: number;
}

export interface GuidanceEventContent {
    question: string;
    options?: string[];
    timeout_seconds?: number;
    pause_id: string;
    scenario: string;
    tool_name: string;
    agent_slug: string;
    requires_auth: boolean;
    execution_id: string;
    ui_hint?: import('./hitl/hitl.types').UIHint;
    browser_url?: string;
    preview_url?: string;
    artifact_path?: string;
}

export interface TokenEventContent {
    text: string;
    tokenCount: number;
}

export interface ToolCallEventContent {
    toolName: string;
    arguments: Record<string, unknown>;
    callId: string;
}

export interface ToolResultEventContent {
    callId: string;
    result: unknown;
    durationMs: number;
    success: boolean;
}

export interface ReasoningEventContent {
    thought: string;
    confidence?: number;
}

export interface MemoryUpdateEventContent {
    operation: 'save' | 'update' | 'delete';
    scope: 'company' | 'project' | 'channel' | 'agent' | 'user' | 'entity' | 'topic';
    path: string;
    category?: string;
}

export interface KbQueryEventContent {
    query: string;
    resultsCount: number;
    kbIds: string[];
}

export interface SelfModerationEventContent {
    checklist: string[];
    qualityScore: number;
    passed: boolean;
}

export interface ContextWarningEventContent {
    warningType: 'approaching_limit' | 'at_limit' | 'overflow';
    currentUsage: number;
    maxBudget: number;
    percentUsed: number;
}

export interface DoneEventContent {
    finalResponse?: string;
    summary: ExecutionSummary;
    error?: ExecutionErrorInfo;
    databaseUpdated: boolean;
}

export interface NotificationEventContent {
    notification_type: string;
    message: string;
    priority: string;
    action_required: boolean;
    agent_slug: string;
}

export interface DoneEventMeta {
    failedAt?: string;
    runId: number | null;
    requestId: string;
    traceId: string;
    responseTimeMs: number;
}
