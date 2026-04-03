// Runner v2 Types - JSON Protocol
// Types for the persistent agent runner process inside Daytona sandbox
// Protocol: stdin/stdout JSON lines between backend and runner
// Reference: EXECUTION_ARCHITECTURE_v2.md Appendix B

// -----------------------------------------------------------------------------
// Inbound Commands (Backend -> Runner via stdin)
// Canonical command types are defined in stdin-parser.ts (uses `type` field).
// CreditResponseCommand is defined in shared/types/credit-protocol.types.ts
// and re-exported here for backward compatibility.
// -----------------------------------------------------------------------------

export type { CreditResponseCommand } from '../../../shared/types/credit-protocol.types';

export interface ScaffoldFile {
    path: string;
    content: string;
}

// -----------------------------------------------------------------------------
// Outbound Events (Runner -> Backend via stdout)
// Captured by backend using Daytona Sessions API getSessionCommandLogs()
// -----------------------------------------------------------------------------

export type RunnerEventType =
    | 'agent_output'
    | 'session_started'
    | 'session_ended'
    | 'agent_message'
    | 'health'
    | 'sessions'
    | 'credit_check'
    | 'error'
    | 'sse_forward'
    | 'credit_usage'
    | 'session_analytics'
    | 'update_agent_run'
    | 'create_inbox_item'
    | 'push_notification'
    | 'delegation_record'
    | 'hook_log'
    | 'ace_reflection'
    | 'skill_suggestion'
    | 'sandbox_lifecycle'
    | 'trigger_indexing'
    | 'subagent_failure'
    | 'scaffold_complete'
    | 'metadata_sync'
    | 'session_completed'
    | 'hitl_request';

export interface RunnerEventBase {
    event: RunnerEventType;
    agent?: string;
    session_id?: string;
    timestamp?: string;
}

export interface AgentOutputEvent extends RunnerEventBase {
    event: 'agent_output';
    agent: string;
    session_id: string;
    data: {
        type: string;
        message: unknown;
    };
}

export interface SessionStartedEvent extends RunnerEventBase {
    event: 'session_started';
    agent: string;
    session_id: string;
    reserved_credits?: number;
}

export interface SessionEndedEvent extends RunnerEventBase {
    event: 'session_ended';
    agent: string;
    session_id: string;
    reason: 'complete' | 'error' | 'interrupt' | 'done';
    usage: {
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
    };
}

export interface AgentMessageEvent extends RunnerEventBase {
    event: 'agent_message';
    from: string;
    to: string;
    content: string;
    domain?: string;
    channel?: string;
}

export interface HealthResponseEvent extends RunnerEventBase {
    event: 'health';
    status: 'ok' | 'degraded' | 'error';
    active_sessions: number;
    uptime_seconds: number;
    agents_registered: number;
}

export interface SessionsListEvent extends RunnerEventBase {
    event: 'sessions';
    sessions: SessionInfo[];
}

export interface SessionInfo {
    agent: string;
    session_id: string;
    started_at: string;
    status: 'running' | 'idle';
}

export interface CreditCheckEvent extends RunnerEventBase {
    event: 'credit_check';
    agent: string;
    estimated_tokens: number;
    trigger: 'execute' | 'heartbeat' | 'message';
}

export interface ErrorEvent extends RunnerEventBase {
    event: 'error';
    agent?: string;
    message: string;
    code?: string;
    recoverable: boolean;
}

export interface SseForwardEvent extends RunnerEventBase {
    event: 'sse_forward';
    sse_event: string;
    payload: unknown;
}

export interface CreditUsageEvent extends RunnerEventBase {
    event: 'credit_usage';
    agent: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    credits_consumed: number;
}

export interface SessionAnalyticsEvent extends RunnerEventBase {
    event: 'session_analytics';
    agent: string;
    duration_ms: number;
    tool_calls: number;
    turns: number;
    model: string;
}

export interface UpdateAgentRunEvent extends RunnerEventBase {
    event: 'update_agent_run';
    agent: string;
    run_id: string;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    metadata?: Record<string, unknown>;
}

export interface CreateInboxItemEvent extends RunnerEventBase {
    event: 'create_inbox_item';
    agent: string;
    channel: string;
    content: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
}

export interface PushNotificationEvent extends RunnerEventBase {
    event: 'push_notification';
    agent?: string;
    user_id: string;
    title: string;
    body: string;
    action_url?: string;
}

export interface DelegationRecordEvent extends RunnerEventBase {
    event: 'delegation_record';
    from_agent: string;
    to_agent: string;
    task: string;
    reason: string;
}

export interface HookLogEvent extends RunnerEventBase {
    event: 'hook_log';
    agent: string;
    hook_event: string;
    duration_ms: number;
    success: boolean;
    error?: string;
}

export interface AceReflectionEvent extends RunnerEventBase {
    event: 'ace_reflection';
    agent: string;
    reflection_type: string;
    content: string;
    confidence: number;
}

export interface SkillSuggestionEvent extends RunnerEventBase {
    event: 'skill_suggestion';
    agent: string;
    skill_name: string;
    reason: string;
    auto_apply: boolean;
}

export interface SandboxLifecycleEvent extends RunnerEventBase {
    event: 'sandbox_lifecycle';
    sandbox_id: string;
    action: 'start' | 'stop' | 'archive' | 'delete' | 'restore';
    previous_state?: string;
}

export interface TriggerIndexingEvent extends RunnerEventBase {
    event: 'trigger_indexing';
    agent: string;
    content_type: string;
    content_path: string;
    operation: 'index' | 'reindex' | 'delete';
}

export interface SubagentFailureEvent extends RunnerEventBase {
    event: 'subagent_failure';
    agent: string;
    subagent_type: string;
    error_message: string;
    error_code?: string;
    recoverable: boolean;
}

export interface ScaffoldCompleteEvent extends RunnerEventBase {
    event: 'scaffold_complete';
    agent: string;
    data: {
        files_written: number;
    };
}

export interface MetadataSyncEvent extends RunnerEventBase {
    event: 'metadata_sync';
    entity: 'agent';
    action: 'create' | 'update' | 'delete';
    data: {
        slug: string;
        name?: string;
        description?: string;
        ai_model?: string;
        thinking_level?: string;
        autonomy_level?: string;
        [key: string]: unknown;
    };
}

export interface HitlRequestEvent extends RunnerEventBase {
    event: 'hitl_request';
    agent_slug: string;
    session_id: string;
    data: {
        pause_id: string;
        scenario: string;
        question: string;
        tool_name: string;
        tool_input: Record<string, unknown>;
        options?: string[];
        requires_auth?: boolean;
        timeout_seconds: number;
    };
}

export type RunnerEvent =
    | AgentOutputEvent
    | SessionStartedEvent
    | SessionEndedEvent
    | AgentMessageEvent
    | HealthResponseEvent
    | SessionsListEvent
    | CreditCheckEvent
    | ErrorEvent
    | SseForwardEvent
    | CreditUsageEvent
    | SessionAnalyticsEvent
    | UpdateAgentRunEvent
    | CreateInboxItemEvent
    | PushNotificationEvent
    | DelegationRecordEvent
    | HookLogEvent
    | AceReflectionEvent
    | SkillSuggestionEvent
    | SandboxLifecycleEvent
    | TriggerIndexingEvent
    | SubagentFailureEvent
    | ScaffoldCompleteEvent
    | MetadataSyncEvent
    | HitlRequestEvent;

// Re-export configuration types (inlined in agent-config-loader after deletion of legacy process-manager)
export type { AgentConfig, PresetSystemPrompt, SystemPrompt } from './agent-config-loader';
export type {
    McpServerConfig,
    SessionState,
    RunnerConfig,
} from './runner-config.types';
export { RUNNER_ENV } from './runner-config.types';
