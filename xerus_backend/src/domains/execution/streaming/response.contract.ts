// Response Contract and Serialization
// Defines and implements response format for all execution endpoints
// Task: xerus-y5v.4.74

import {
    StreamEventType,
    ExecutionStatus,
    ExecutionSummary,
    ExecutionErrorInfo,
    DoneEventMeta,
} from '../types';

// -----------------------------------------------------------------------------
// SSE Response Envelope (matches spec: type, success, execution_id, content, meta)
// -----------------------------------------------------------------------------

export interface SSEEventEnvelope {
    type: StreamEventType;
    success: boolean;
    execution_id: string;
    content: unknown;
    meta: SSEEventMeta;
}

export interface SSEEventMeta {
    timestamp: string;
    sequence: number;
    agent_slug: string;
    session_id?: string;
}

interface SerializeSSEEventInput {
    type: StreamEventType;
    executionId: string;
    content: unknown;
    agentSlug: string;
    sequence: number;
    sessionId?: string;
    success?: boolean;
}

export function serializeSSEEvent(input: SerializeSSEEventInput): SSEEventEnvelope {
    const meta: SSEEventMeta = {
        timestamp: new Date().toISOString(),
        sequence: input.sequence,
        agent_slug: input.agentSlug,
    };

    if (input.sessionId) {
        meta.session_id = input.sessionId;
    }

    return {
        type: input.type,
        success: input.success ?? true,
        execution_id: input.executionId,
        content: input.content,
        meta,
    };
}

// -----------------------------------------------------------------------------
// Done Event (Final Response)
// -----------------------------------------------------------------------------

export interface DoneEventPayload {
    finalResponse?: string;
    summary: ExecutionSummary;
    databaseUpdated: boolean;
    outputFiles?: string[];
    creditsConsumed?: number;
    toolCallsSummary?: ToolCallSummaryEntry[];
    error?: ExecutionErrorInfo;
}

export interface ToolCallSummaryEntry {
    name: string;
    count: number;
    totalDurationMs: number;
}

interface SerializeDoneEventInput {
    executionId: string;
    finalResponse?: string;
    summary: ExecutionSummary;
    meta: DoneEventMeta;
    agentSlug: string;
    sequence: number;
    sessionId?: string;
    databaseUpdated?: boolean;
    outputFiles?: string[];
    creditsConsumed?: number;
    toolCallsSummary?: ToolCallSummaryEntry[];
}

export interface DoneEventEnvelope {
    type: 'done';
    success: boolean;
    execution_id: string;
    content: DoneEventPayload;
    meta: SSEEventMeta & DoneEventMeta;
}

export function serializeDoneEvent(input: SerializeDoneEventInput): DoneEventEnvelope {
    const content: DoneEventPayload = {
        finalResponse: input.finalResponse,
        summary: input.summary,
        databaseUpdated: input.databaseUpdated ?? false,
    };

    if (input.outputFiles) {
        content.outputFiles = input.outputFiles;
    }

    if (input.creditsConsumed !== undefined) {
        content.creditsConsumed = input.creditsConsumed;
    }

    if (input.toolCallsSummary) {
        content.toolCallsSummary = input.toolCallsSummary;
    }

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
        success: true,
        execution_id: input.executionId,
        content,
        meta: {
            ...sseMeta,
            ...input.meta,
        },
    };
}

// -----------------------------------------------------------------------------
// Non-SSE Endpoint Responses
// -----------------------------------------------------------------------------

// GET /status response

export interface ExecutionStatusResponse {
    execution_id: string;
    status: ExecutionStatus;
    agent_slug: string;
    started_at: string;
    completed_at?: string;
    progress?: { phase: string; percent: number };
    summary?: ExecutionSummary;
    error?: ExecutionErrorInfo;
}

interface SerializeExecutionStatusInput {
    executionId: string;
    status: ExecutionStatus;
    agentSlug: string;
    startedAt: string;
    completedAt?: string;
    progress?: { phase: string; percent: number };
    summary?: ExecutionSummary;
    error?: ExecutionErrorInfo;
}

export function serializeExecutionStatus(input: SerializeExecutionStatusInput): ExecutionStatusResponse {
    const response: ExecutionStatusResponse = {
        execution_id: input.executionId,
        status: input.status,
        agent_slug: input.agentSlug,
        started_at: input.startedAt,
    };

    if (input.completedAt) {
        response.completed_at = input.completedAt;
    }

    if (input.progress) {
        response.progress = input.progress;
    }

    if (input.summary) {
        response.summary = input.summary;
    }

    if (input.error) {
        response.error = input.error;
    }

    return response;
}

// POST /respond - HITL acknowledgment

export interface HITLAcknowledgmentResponse {
    execution_id: string;
    guidance_id: string;
    accepted: boolean;
    response_value?: string;
    acknowledged_at: string;
}

interface SerializeHITLInput {
    executionId: string;
    guidanceId: string;
    accepted: boolean;
    responseValue?: string;
}

export function serializeHITLAcknowledgment(input: SerializeHITLInput): HITLAcknowledgmentResponse {
    const response: HITLAcknowledgmentResponse = {
        execution_id: input.executionId,
        guidance_id: input.guidanceId,
        accepted: input.accepted,
        acknowledged_at: new Date().toISOString(),
    };

    if (input.responseValue !== undefined) {
        response.response_value = input.responseValue;
    }

    return response;
}

// POST /cancel - Cancellation result

export interface CancellationResultResponse {
    execution_id: string;
    cancelled: boolean;
    method: 'graceful' | 'forced';
    reason?: string;
    cancelled_at: string;
}

interface SerializeCancellationInput {
    executionId: string;
    cancelled: boolean;
    method: 'graceful' | 'forced';
    reason?: string;
}

export function serializeCancellationResult(input: SerializeCancellationInput): CancellationResultResponse {
    const response: CancellationResultResponse = {
        execution_id: input.executionId,
        cancelled: input.cancelled,
        method: input.method,
        cancelled_at: new Date().toISOString(),
    };

    if (input.reason) {
        response.reason = input.reason;
    }

    return response;
}

// -----------------------------------------------------------------------------
// Transcript Endpoint
// GET /api/v1/executions/:execution_id/transcript
// -----------------------------------------------------------------------------

export interface TranscriptEvent {
    id: number;
    execution_id: string;
    event_type: StreamEventType;
    event_data: unknown;
    sequence_number: number;
    created_at: string;
}

export interface TranscriptPageResponse {
    execution_id: string;
    events: TranscriptEvent[];
    pagination: {
        total: number;
        limit: number;
        offset: number;
        has_more: boolean;
    };
}

interface SerializeTranscriptPageInput {
    executionId: string;
    events: TranscriptEvent[];
    total: number;
    limit: number;
    offset: number;
}

export function serializeTranscriptPage(input: SerializeTranscriptPageInput): TranscriptPageResponse {
    return {
        execution_id: input.executionId,
        events: input.events,
        pagination: {
            total: input.total,
            limit: input.limit,
            offset: input.offset,
            has_more: input.offset + input.limit < input.total,
        },
    };
}

// -----------------------------------------------------------------------------
// Sequence Tracker
// Tracks event sequence numbers within an execution
// -----------------------------------------------------------------------------

export class SequenceTracker {
    private sequence = 0;

    next(): number {
        return ++this.sequence;
    }

    current(): number {
        return this.sequence;
    }

    reset(): void {
        this.sequence = 0;
    }
}
