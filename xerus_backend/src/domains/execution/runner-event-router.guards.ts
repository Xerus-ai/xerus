// Runner Event Router Guards
// Typed interfaces and assertion functions for runner event data.
// Extracted from runner-event-router.ts to keep files under 400 lines.

import type { HITLScenario, UIHint } from './hitl/hitl.types';

const LOG_PREFIX = '[EventRouter]';

// ---------------------------------------------------------------------------
// Typed event data interfaces (grouped by category)
// ---------------------------------------------------------------------------

// -- Category A: Core execution events --

export interface ToolCallEventData {
    call_id: string;
    tool_name: string;
    arguments?: Record<string, unknown>;
}

export interface ToolResultEventData {
    call_id: string;
    result?: unknown;
    success?: boolean;
}

export interface SessionStartedEventData {
    session_id?: string;
    data?: { model?: string; [k: string]: unknown };
    agent_slug?: string;
}

export interface SessionEndedEventData {
    usage?: { input_tokens?: number; output_tokens?: number };
}

export interface SessionCompletedEventData {
    status?: string;
    reason?: string;
    summary?: string;
}

export interface CreditUsageEventData {
    credits_consumed?: number;
}

export interface SseForwardEventData {
    sse_event: string;
    payload?: Record<string, unknown>;
    meta?: unknown;
}

// -- Category B: DB write events --

export interface CreateInboxItemEventData {
    channel?: string;
    content: string;
    priority?: string;
}

export interface AgentMessageEventData {
    channel: string;
    content: string;
    agent_slug?: string;
    project?: string;
    message_type?: 'chat' | 'task_update' | 'status' | 'system';
    metadata?: Record<string, unknown>;
}

export interface HookLogEventData {
    hook_event: string;
    duration_ms?: number;
    success?: boolean;
}

export interface SubagentFailureEventData {
    subagent_type?: string;
    subagent_name?: string;
    agent_slug?: string;
    success: false;
    duration_ms?: number;
    summary?: string;
    error?: string;
    message?: string;
}

export interface SandboxLifecycleEventData {
    sandbox_id: string;
    action: string;
}

// -- Category C: Notification / delegation / HITL --

export interface PushNotificationEventData {
    body?: string;
    agent_slug?: string;
}

export interface DelegationRecordEventData {
    from_agent?: string;
    agent_slug?: string;
    to_agent?: string;
    subagent_type?: string;
    task?: string;
}

export interface HitlRequestEventData {
    question: string;
    tool_name: string;
    agent_slug?: string;
    scenario?: HITLScenario;
    tool_input?: Record<string, unknown>;
    options?: string[];
    expanded_context?: string;
    requires_auth?: boolean;
    timeout_seconds?: number;
    ui_hint?: UIHint;
    browser_url?: string;
    preview_url?: string;
    artifact_path?: string;
}

// -- Content block shapes for agent_output extraction --

export interface TextContentBlock {
    type: 'text';
    text: string;
}

// ---------------------------------------------------------------------------
// Type guard / assertion functions (fail-fast)
// ---------------------------------------------------------------------------

export function assertToolCallData(d: Record<string, unknown>): ToolCallEventData {
    const callId = d.callId ?? d.call_id ?? d.id;
    const toolName = d.toolName ?? d.tool_name ?? d.name ?? d.tool;
    return {
        call_id: typeof callId === 'string' ? callId : '',
        tool_name: typeof toolName === 'string' ? toolName : 'unknown',
        arguments: (d.arguments ?? d.input ?? d.tool_input) as Record<string, unknown> | undefined,
    };
}

export function assertToolResultData(d: Record<string, unknown>): ToolResultEventData {
    const callId = d.callId ?? d.call_id;
    return {
        call_id: typeof callId === 'string' ? callId : '',
        result: d.result,
        success: typeof d.success === 'boolean' ? d.success : undefined,
    };
}

export function assertSessionStartedData(d: Record<string, unknown>): SessionStartedEventData {
    const nested = typeof d.data === 'object' && d.data !== null ? d.data as Record<string, unknown> : undefined;
    return {
        session_id: typeof d.session_id === 'string' ? d.session_id : undefined,
        data: nested ? { model: typeof nested.model === 'string' ? nested.model : undefined, ...nested } : undefined,
        agent_slug: typeof d.agent_slug === 'string' ? d.agent_slug : undefined,
    };
}

export function assertSessionEndedData(d: Record<string, unknown>): SessionEndedEventData {
    const usage = typeof d.usage === 'object' && d.usage !== null ? d.usage as Record<string, unknown> : undefined;
    return {
        usage: usage ? {
            input_tokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined,
            output_tokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : undefined,
        } : undefined,
    };
}

export function assertSessionCompletedData(d: Record<string, unknown>): SessionCompletedEventData {
    if (typeof d.status !== 'string') {
        console.warn(`${LOG_PREFIX} session_completed: missing status field, defaulting to unknown`);
    }
    return {
        status: typeof d.status === 'string' ? d.status : 'unknown',
        reason: typeof d.reason === 'string' ? d.reason : '',
        summary: typeof d.summary === 'string' ? d.summary : '',
    };
}

export function assertCreditUsageData(d: Record<string, unknown>): CreditUsageEventData {
    return {
        credits_consumed: typeof d.credits_consumed === 'number' ? d.credits_consumed : undefined,
    };
}

export function assertSseForwardData(d: Record<string, unknown>): SseForwardEventData {
    if (typeof d.sse_event !== 'string') {
        throw new Error(`${LOG_PREFIX} sse_forward: missing sse_event field`);
    }
    return {
        sse_event: d.sse_event,
        payload: typeof d.payload === 'object' && d.payload !== null ? d.payload as Record<string, unknown> : undefined,
        meta: d.meta,
    };
}

export function assertCreateInboxItemData(d: Record<string, unknown>): CreateInboxItemEventData {
    if (typeof d.content !== 'string' || d.content.length === 0) {
        throw new Error(`${LOG_PREFIX} create_inbox_item: missing content`);
    }
    return {
        channel: typeof d.channel === 'string' ? d.channel : undefined,
        content: d.content,
        priority: typeof d.priority === 'string' ? d.priority : 'normal',
    };
}

export function assertAgentMessageData(d: Record<string, unknown>): AgentMessageEventData {
    if (typeof d.channel !== 'string' || typeof d.content !== 'string') {
        throw new Error(`${LOG_PREFIX} agent_message: missing channel or content`);
    }
    return {
        channel: d.channel,
        content: d.content,
        agent_slug: typeof d.agent_slug === 'string' ? d.agent_slug : '',
        project: typeof d.project === 'string' ? d.project : '',
        message_type: isMessageType(d.message_type) ? d.message_type : 'chat',
        metadata: typeof d.metadata === 'object' && d.metadata !== null ? d.metadata as Record<string, unknown> : undefined,
    };
}

function isMessageType(v: unknown): v is 'chat' | 'task_update' | 'status' | 'system' {
    return v === 'chat' || v === 'task_update' || v === 'status' || v === 'system';
}

export function assertHookLogData(d: Record<string, unknown>): HookLogEventData {
    if (typeof d.hook_event !== 'string') {
        throw new Error(`${LOG_PREFIX} hook_log: missing hook_event field`);
    }
    return {
        hook_event: d.hook_event,
        duration_ms: typeof d.duration_ms === 'number' ? d.duration_ms : 0,
        success: typeof d.success === 'boolean' ? d.success : true,
    };
}

export function assertSubagentFailureData(d: Record<string, unknown>): SubagentFailureEventData {
    if (typeof d.subagent_type !== 'string') {
        console.warn(`${LOG_PREFIX} subagent_failure: missing subagent_type field, defaulting to unknown`);
    }
    return {
        subagent_type: typeof d.subagent_type === 'string' ? d.subagent_type : 'unknown',
        subagent_name: typeof d.subagent_name === 'string' ? d.subagent_name : typeof d.agent_slug === 'string' ? d.agent_slug : 'unknown',
        success: false,
        duration_ms: typeof d.duration_ms === 'number' ? d.duration_ms : 0,
        summary: typeof d.summary === 'string' ? d.summary : undefined,
        error: typeof d.error === 'string' ? d.error : typeof d.message === 'string' ? d.message : undefined,
    };
}

export function assertSandboxLifecycleData(d: Record<string, unknown>): SandboxLifecycleEventData {
    if (typeof d.sandbox_id !== 'string' || typeof d.action !== 'string') {
        throw new Error(`${LOG_PREFIX} sandbox_lifecycle: missing sandbox_id or action`);
    }
    return { sandbox_id: d.sandbox_id, action: d.action };
}

export function assertPushNotificationData(d: Record<string, unknown>): PushNotificationEventData {
    return {
        body: typeof d.body === 'string' ? d.body : '',
        agent_slug: typeof d.agent_slug === 'string' ? d.agent_slug : '',
    };
}

export function assertDelegationRecordData(d: Record<string, unknown>): DelegationRecordEventData {
    return {
        from_agent: typeof d.from_agent === 'string' ? d.from_agent : typeof d.agent_slug === 'string' ? d.agent_slug : '',
        to_agent: typeof d.to_agent === 'string' ? d.to_agent : typeof d.subagent_type === 'string' ? d.subagent_type : '',
        task: typeof d.task === 'string' ? d.task : '',
    };
}

export function assertHitlRequestData(d: Record<string, unknown>): HitlRequestEventData {
    if (typeof d.question !== 'string') {
        throw new Error(`${LOG_PREFIX} hitl_request: missing required field: question`);
    }
    if (typeof d.tool_name !== 'string') {
        throw new Error(`${LOG_PREFIX} hitl_request: missing required field: tool_name`);
    }
    return {
        question: d.question,
        tool_name: d.tool_name,
        agent_slug: typeof d.agent_slug === 'string' ? d.agent_slug : undefined,
        scenario: typeof d.scenario === 'string' ? d.scenario as HITLScenario : undefined,
        tool_input: typeof d.tool_input === 'object' && d.tool_input !== null ? d.tool_input as Record<string, unknown> : {},
        options: Array.isArray(d.options) ? d.options as string[] : undefined,
        expanded_context: typeof d.expanded_context === 'string' ? d.expanded_context : undefined,
        requires_auth: typeof d.requires_auth === 'boolean' ? d.requires_auth : undefined,
        timeout_seconds: typeof d.timeout_seconds === 'number' ? d.timeout_seconds : undefined,
        ui_hint: typeof d.ui_hint === 'string' ? d.ui_hint as UIHint : undefined,
        browser_url: typeof d.browser_url === 'string' ? d.browser_url : undefined,
        preview_url: typeof d.preview_url === 'string' ? d.preview_url : undefined,
        artifact_path: typeof d.artifact_path === 'string' ? d.artifact_path : undefined,
    };
}

// ---------------------------------------------------------------------------
// Content block helpers for agent_output extraction
// ---------------------------------------------------------------------------

export function isTextContentBlock(block: unknown): block is TextContentBlock {
    return typeof block === 'object' && block !== null
        && (block as Record<string, unknown>).type === 'text'
        && typeof (block as Record<string, unknown>).text === 'string';
}

/** Resolve an array of content blocks from the multiple possible wrapper shapes. */
export function resolveContentBlocks(content: unknown): unknown[] | null {
    if (!content || typeof content !== 'object') return null;

    // Shape: direct array of content blocks
    if (Array.isArray(content)) return content;

    const obj = content as Record<string, unknown>;

    // Shape: object with `content` array (e.g. SDK message)
    if (Array.isArray(obj.content)) return obj.content;

    // Shape: nested `message.content` (e.g. { type: 'assistant', message: { content: [...] } })
    if (obj.message && typeof obj.message === 'object') {
        const msg = obj.message as Record<string, unknown>;
        if (Array.isArray(msg.content)) return msg.content;
    }

    return null;
}
