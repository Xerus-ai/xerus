// SSE Streaming Handler
// Manages Server-Sent Events streaming for agent execution.
// Stream is long-lived (per conversation), outlives individual executions.

import { Response } from 'express';
import { randomUUID } from 'crypto';
import { StreamEvent, StreamEventType, DoneEventMeta, ExecutionErrorInfo, ExecutionSummary } from '../types';
import { classifyErrorFromObject, extractErrorCode } from './error-classifier';
import { logger } from '../../../utils/logger';

// -----------------------------------------------------------------------------
// SSE Headers
// -----------------------------------------------------------------------------

const SSE_HEADERS = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
} as const;

// -----------------------------------------------------------------------------
// StreamSink Interface
// Common interface for all stream implementations (SSE, Null, etc.)
// Used by the execution pipeline so it can work with both real SSE streams
// (conversation-scoped) and no-op streams (channel-scoped background execution).
// -----------------------------------------------------------------------------

export interface StreamSink {
    getExecutionId(): string;
    setExecutionId(executionId: string): void;
    setParentToolUseId(parentToolUseId: string): void;
    clearParentToolUseId(): void;
    send(type: StreamEventType, content: unknown, meta?: unknown): void;
    sendError(error: Error | ExecutionErrorInfo, meta?: Partial<DoneEventMeta>): void;
    sendDone(
        finalResponse: string | undefined,
        summary: ExecutionSummary,
        meta?: Partial<DoneEventMeta>,
        options?: { databaseUpdated?: boolean; conversationId?: string | null },
    ): void;
    sendHeartbeat(): void;
    close(): void;
    isClosed(): boolean;
}

// -----------------------------------------------------------------------------
// StreamingResponse Class
// -----------------------------------------------------------------------------

export class StreamingResponse implements StreamSink {
    private readonly res: Response;
    private executionId: string;
    private parentToolUseId: string | null = null;
    private eventSequence = 0;
    private closed = false;

    constructor(res: Response, executionId?: string) {
        this.res = res;
        this.executionId = executionId ?? randomUUID();
        this.setupSSE();
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    getExecutionId(): string {
        return this.executionId;
    }

    setExecutionId(executionId: string): void {
        this.executionId = executionId;
    }

    setParentToolUseId(parentToolUseId: string): void {
        this.parentToolUseId = parentToolUseId;
    }

    clearParentToolUseId(): void {
        this.parentToolUseId = null;
    }

    send(type: StreamEventType, content: unknown, meta?: unknown): void {
        if (this.closed) {
            return;
        }

        this.eventSequence++;

        const event: StreamEvent = {
            type,
            success: true,
            execution_id: this.executionId,
            content,
            meta: this.enrichMeta(meta),
        };

        this.writeEvent(event);
    }

    sendError(error: Error | ExecutionErrorInfo, meta?: Partial<DoneEventMeta>): void {
        if (this.closed) {
            return;
        }

        const errorInfo = this.normalizeError(error);
        const doneMeta = this.buildDoneMeta(meta);

        const event: StreamEvent = {
            type: 'done',
            success: false,
            execution_id: this.executionId,
            content: {
                error: errorInfo,
                summary: this.buildEmptySummary(doneMeta.responseTimeMs),
                databaseUpdated: false,
            },
            meta: doneMeta,
        };

        this.writeEvent(event);
        // Stream stays open — it belongs to the conversation, not this execution
    }

    sendDone(
        finalResponse: string | undefined,
        summary: ExecutionSummary,
        meta?: Partial<DoneEventMeta>,
        options?: { databaseUpdated?: boolean; conversationId?: string | null }
    ): void {
        if (this.closed) {
            return;
        }

        const doneMeta = this.buildDoneMeta(meta);

        const event: StreamEvent = {
            type: 'done',
            success: true,
            execution_id: this.executionId,
            content: {
                finalResponse,
                summary,
                databaseUpdated: options?.databaseUpdated ?? false,
                conversationId: options?.conversationId ?? undefined,
            },
            meta: doneMeta,
        };

        this.writeEvent(event);
        // Stream stays open — it belongs to the conversation, not this execution
    }

    sendHeartbeat(): void {
        if (this.closed) {
            return;
        }
        // SSE comment line — keeps connection alive through proxies
        // without polluting the event stream
        this.res.write(':keepalive\n\n');
    }

    close(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.res.end();
    }

    isClosed(): boolean {
        return this.closed;
    }

    // -------------------------------------------------------------------------
    // Private Methods
    // -------------------------------------------------------------------------

    private setupSSE(): void {
        Object.entries(SSE_HEADERS).forEach(([key, value]) => {
            this.res.setHeader(key, value);
        });

        // Flush headers immediately
        this.res.flushHeaders();

        // Handle client disconnect
        this.res.on('close', () => {
            this.closed = true;
        });
    }

    private writeEvent(event: StreamEvent): void {
        if (this.res.writableEnded) {
            this.closed = true;
            return;
        }
        const data = JSON.stringify(event);
        this.res.write(`data: ${data}\n\n`);
    }

    private enrichMeta(meta: unknown): unknown {
        const baseMeta: Record<string, unknown> = {
            sequence: this.eventSequence,
        };

        if (this.parentToolUseId) {
            baseMeta.parent_tool_use_id = this.parentToolUseId;
        }

        if (meta && typeof meta === 'object') {
            return { ...baseMeta, ...meta };
        }

        return baseMeta;
    }

    private normalizeError(error: Error | ExecutionErrorInfo): ExecutionErrorInfo {
        if (this.isExecutionErrorInfo(error)) {
            return error;
        }

        // Use shared utilities for consistent error handling
        const errorCode = extractErrorCode(error);
        const errorType = classifyErrorFromObject(error, errorCode);

        return {
            message: error.message,
            code: errorCode,
            type: errorType,
        };
    }

    private isExecutionErrorInfo(error: unknown): error is ExecutionErrorInfo {
        return (
            typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            'code' in error &&
            'type' in error
        );
    }

    private buildDoneMeta(partial?: Partial<DoneEventMeta>): DoneEventMeta {
        return {
            runId: partial?.runId ?? null,
            requestId: partial?.requestId ?? randomUUID(),
            traceId: partial?.traceId ?? randomUUID(),
            responseTimeMs: partial?.responseTimeMs ?? 0,
            failedAt: partial?.failedAt,
        };
    }

    private buildEmptySummary(durationMs: number): ExecutionSummary {
        return {
            totalTokens: 0,
            durationMs,
            toolCalls: 0,
            agentsUsed: 0,
        };
    }
}

// -----------------------------------------------------------------------------
// NullStreamingResponse
// A no-op stream that implements StreamSink but discards all output.
// Used for background executions triggered from channel messages where no
// frontend SSE connection exists.
// -----------------------------------------------------------------------------

export class NullStreamingResponse implements StreamSink {
    private executionId: string;
    private closed = false;

    constructor(executionId?: string) {
        this.executionId = executionId ?? randomUUID();
    }

    getExecutionId(): string {
        return this.executionId;
    }

    setExecutionId(executionId: string): void {
        this.executionId = executionId;
    }

    setParentToolUseId(_parentToolUseId: string): void {
        // no-op
    }

    clearParentToolUseId(): void {
        // no-op
    }

    send(_type: StreamEventType, _content: unknown, _meta?: unknown): void {
        // no-op: discard streaming events for background channel executions
    }

    sendError(error: Error | ExecutionErrorInfo, _meta?: Partial<DoneEventMeta>): void {
        // Log errors so background channel executions are observable
        const log = logger('NullStream');
        const msg = error instanceof Error ? error.message : (error as ExecutionErrorInfo).message ?? 'Unknown error';
        log.error('Background execution error', { execution_id: this.executionId, error: msg });
    }

    sendDone(
        _finalResponse: string | undefined,
        _summary: ExecutionSummary,
        _meta?: Partial<DoneEventMeta>,
        _options?: { databaseUpdated?: boolean; conversationId?: string | null },
    ): void {
        // no-op
    }

    sendHeartbeat(): void {
        // no-op
    }

    close(): void {
        this.closed = true;
    }

    isClosed(): boolean {
        return this.closed;
    }
}
