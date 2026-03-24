// Response Error Builders
// Serializers for error responses in SSE and non-SSE endpoints
// Task: xerus-y5v.4.74

import { ErrorType, ExecutionSummary, DoneEventMeta } from '../types';
import { classifyErrorFromObject, extractErrorCode } from './error-classifier';
import { SSEEventMeta } from './response.contract';

// -----------------------------------------------------------------------------
// Error Response Format (non-SSE endpoints)
// -----------------------------------------------------------------------------

export interface ErrorResponse {
    error_code: string;
    message: string;
    execution_id: string;
    recoverable: boolean;
    details?: Record<string, unknown>;
}

interface SerializeErrorInput {
    errorCode: string;
    message: string;
    executionId: string;
    errorType: ErrorType;
    details?: Record<string, unknown>;
    recoverable?: boolean;
}

export function serializeErrorResponse(input: SerializeErrorInput): ErrorResponse {
    const response: ErrorResponse = {
        error_code: input.errorCode,
        message: input.message,
        execution_id: input.executionId,
        recoverable: input.recoverable ?? classifyRecoverable(input.errorType),
    };

    if (input.details) {
        response.details = input.details;
    }

    return response;
}

// -----------------------------------------------------------------------------
// SSE Error Done Event
// -----------------------------------------------------------------------------

export interface SSEErrorContent {
    message: string;
    code: string;
    type: ErrorType;
    recoverable: boolean;
}

export interface SSEErrorDonePayload {
    error: SSEErrorContent;
    summary: ExecutionSummary;
    databaseUpdated: boolean;
}

export interface SSEErrorDoneEvent {
    type: 'done';
    success: false;
    execution_id: string;
    content: SSEErrorDonePayload;
    meta: SSEEventMeta & DoneEventMeta;
}

// Execution-domain error codes to ErrorType mapping
// Supplements the shared error-classifier with domain-specific codes
const EXECUTION_ERROR_CODE_MAP: Record<string, ErrorType> = {
    EXECUTION_TIMEOUT: 'timeout',
    SANDBOX_TIMEOUT: 'timeout',
    EXECUTION_ERROR: 'system_error',
    SDK_EXECUTION_FAILED: 'system_error',
    SANDBOX_CREATION_FAILED: 'system_error',
    SANDBOX_NOT_FOUND: 'system_error',
    SANDBOX_PREVIEW_FAILED: 'system_error',
    UNKNOWN_SANDBOX_STATE: 'system_error',
    STREAMING_ERROR: 'system_error',
    STORAGE_SYNC_FAILED: 'system_error',
    COORDINATION_ERROR: 'system_error',
    MEMORY_LOAD_FAILED: 'system_error',
    CONTEXT_BUILD_FAILED: 'system_error',
    AGENT_NOT_FOUND: 'validation_error',
    INVALID_AUTONOMY_LEVEL: 'validation_error',
};

interface SerializeSSEErrorInput {
    error: Error;
    executionId: string;
    agentSlug: string;
    sequence: number;
    meta: DoneEventMeta;
    sessionId?: string;
    partialSummary?: ExecutionSummary;
}

export function serializeSSEErrorEvent(input: SerializeSSEErrorInput): SSEErrorDoneEvent {
    const errorCode = extractErrorCode(input.error);
    const errorType = EXECUTION_ERROR_CODE_MAP[errorCode] ?? classifyErrorFromObject(input.error, errorCode);

    const sseMeta: SSEEventMeta = {
        timestamp: new Date().toISOString(),
        sequence: input.sequence,
        agent_slug: input.agentSlug,
    };

    if (input.sessionId) {
        sseMeta.session_id = input.sessionId;
    }

    return {
        type: 'done',
        success: false,
        execution_id: input.executionId,
        content: {
            error: {
                message: input.error.message,
                code: errorCode,
                type: errorType,
                recoverable: classifyRecoverable(errorType),
            },
            summary: input.partialSummary ?? {
                totalTokens: 0,
                durationMs: input.meta.responseTimeMs,
                toolCalls: 0,
                agentsUsed: 0,
            },
            databaseUpdated: false,
        },
        meta: {
            ...sseMeta,
            ...input.meta,
        },
    };
}

// -----------------------------------------------------------------------------
// Error Classification Helpers
// -----------------------------------------------------------------------------

const RECOVERABLE_TYPES: ReadonlySet<ErrorType> = new Set([
    'timeout',
    'tool_error',
    'llm_error',
]);

export function classifyRecoverable(errorType: ErrorType): boolean {
    return RECOVERABLE_TYPES.has(errorType);
}

const ERROR_HTTP_STATUS: Record<ErrorType, number> = {
    timeout: 408,
    tool_error: 500,
    llm_error: 502,
    context_overflow: 413,
    user_cancel: 499,
    auth_error: 401,
    validation_error: 400,
    system_error: 500,
};

export function mapErrorToHttpStatus(errorType: ErrorType): number {
    return ERROR_HTTP_STATUS[errorType];
}
