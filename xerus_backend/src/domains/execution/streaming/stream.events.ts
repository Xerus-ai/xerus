// Stream Event Factory Functions
// Creates typed StreamEvent objects for all 12 event types

import {
    StreamEvent,
    StreamEventType,
    MetaEventContent,
    ProgressEventContent,
    GuidanceEventContent,
    TokenEventContent,
    ToolCallEventContent,
    ToolResultEventContent,
    ReasoningEventContent,
    MemoryUpdateEventContent,
    KbQueryEventContent,
    SelfModerationEventContent,
    ContextWarningEventContent,
    DoneEventContent,
    DoneEventMeta,
    ErrorType,
} from '../types';
import { classifyErrorType } from './error-classifier';

// -----------------------------------------------------------------------------
// Generic Event Creator
// -----------------------------------------------------------------------------

function createEvent<T>(
    type: StreamEventType,
    executionId: string,
    content: T,
    meta?: unknown,
    options?: { success?: boolean; parentToolUseId?: string }
): StreamEvent {
    return {
        type,
        success: options?.success ?? true,
        execution_id: executionId,
        content,
        meta,
    };
}

// -----------------------------------------------------------------------------
// Event Factory Functions
// -----------------------------------------------------------------------------

export function createMetaEvent(
    executionId: string,
    content: MetaEventContent,
    meta?: Record<string, unknown>
): StreamEvent {
    return createEvent('meta', executionId, content, meta);
}

export function createProgressEvent(
    executionId: string,
    content: ProgressEventContent,
    meta?: Record<string, unknown>
): StreamEvent {
    return createEvent('progress', executionId, content, meta);
}

export function createGuidanceEvent(
    executionId: string,
    content: GuidanceEventContent,
    meta?: Record<string, unknown>
): StreamEvent {
    return createEvent('guidance', executionId, content, meta);
}

export function createTokenEvent(
    executionId: string,
    content: TokenEventContent,
    meta?: Record<string, unknown>
): StreamEvent {
    return createEvent('token', executionId, content, meta);
}

export function createToolCallEvent(
    executionId: string,
    content: ToolCallEventContent,
    meta?: Record<string, unknown>
): StreamEvent {
    return createEvent('tool_call', executionId, content, meta);
}

export function createToolResultEvent(
    executionId: string,
    content: ToolResultEventContent,
    meta?: Record<string, unknown>
): StreamEvent {
    return createEvent('tool_result', executionId, content, meta);
}

export function createReasoningEvent(
    executionId: string,
    content: ReasoningEventContent,
    meta?: Record<string, unknown>
): StreamEvent {
    return createEvent('reasoning', executionId, content, meta);
}

export function createMemoryUpdateEvent(
    executionId: string,
    content: MemoryUpdateEventContent,
    meta?: Record<string, unknown>
): StreamEvent {
    return createEvent('memory_update', executionId, content, meta);
}

export function createKbQueryEvent(
    executionId: string,
    content: KbQueryEventContent,
    meta?: Record<string, unknown>
): StreamEvent {
    return createEvent('kb_query', executionId, content, meta);
}

export function createSelfModerationEvent(
    executionId: string,
    content: SelfModerationEventContent,
    meta?: Record<string, unknown>
): StreamEvent {
    return createEvent('self_moderation', executionId, content, meta);
}

export function createContextWarningEvent(
    executionId: string,
    content: ContextWarningEventContent,
    meta?: Record<string, unknown>
): StreamEvent {
    return createEvent('context_warning', executionId, content, meta);
}

export function createDoneEvent(
    executionId: string,
    content: DoneEventContent,
    meta: DoneEventMeta,
    options?: { success?: boolean }
): StreamEvent {
    return createEvent('done', executionId, content, meta, { success: options?.success ?? true });
}

// -----------------------------------------------------------------------------
// Error Event Helper
// -----------------------------------------------------------------------------

export function createErrorDoneEvent(
    executionId: string,
    error: { message: string; code: string; type?: ErrorType },
    meta: DoneEventMeta
): StreamEvent {
    const errorType = classifyErrorType(error.code, error.type);

    return {
        type: 'done',
        success: false,
        execution_id: executionId,
        content: {
            error: {
                message: error.message,
                code: error.code,
                type: errorType,
            },
            summary: {
                totalTokens: 0,
                durationMs: meta.responseTimeMs,
                toolCalls: 0,
                agentsUsed: 0,
            },
            databaseUpdated: false,
        },
        meta,
    };
}
