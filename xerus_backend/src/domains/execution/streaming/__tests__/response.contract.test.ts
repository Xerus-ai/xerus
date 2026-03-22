// Response Contract Tests
// Tests for SSE response envelope, done event, non-SSE responses, and transcript

import {
    serializeSSEEvent,
    serializeDoneEvent,
    serializeExecutionStatus,
    serializeHITLAcknowledgment,
    serializeCancellationResult,
    serializeTranscriptPage,
    SequenceTracker,
} from '../response.contract';
import {
    ExecutionSummary,
    DoneEventMeta,
    StreamEventType,
} from '../../types';

// -----------------------------------------------------------------------------
// SSE Event Serialization
// -----------------------------------------------------------------------------

describe('serializeSSEEvent', () => {
    const executionId = 'exec-abc-123';

    it('should create envelope with all required fields', () => {
        const result = serializeSSEEvent({
            type: 'token',
            executionId,
            content: { text: 'Hello', tokenCount: 1 },
            agentSlug: 'test-agent',
            sequence: 1,
        });

        expect(result.type).toBe('token');
        expect(result.success).toBe(true);
        expect(result.execution_id).toBe(executionId);
        expect(result.content).toEqual({ text: 'Hello', tokenCount: 1 });
        expect(result.meta.timestamp).toBeDefined();
        expect(result.meta.sequence).toBe(1);
        expect(result.meta.agent_slug).toBe('test-agent');
    });

    it('should include session_id when provided', () => {
        const result = serializeSSEEvent({
            type: 'meta',
            executionId,
            content: { model: 'claude-opus-4-6' },
            agentSlug: 'test-agent',
            sequence: 1,
            sessionId: 'sess-xyz',
        });

        expect(result.meta.session_id).toBe('sess-xyz');
    });

    it('should omit session_id when not provided', () => {
        const result = serializeSSEEvent({
            type: 'progress',
            executionId,
            content: { phase: 'init', message: 'Starting', percent: 0 },
            agentSlug: 'test-agent',
            sequence: 1,
        });

        expect(result.meta.session_id).toBeUndefined();
    });

    it('should set success to false when specified', () => {
        const result = serializeSSEEvent({
            type: 'done',
            executionId,
            content: { error: { message: 'Failed' } },
            agentSlug: 'test-agent',
            sequence: 5,
            success: false,
        });

        expect(result.success).toBe(false);
    });

    it('should produce valid ISO 8601 timestamp', () => {
        const result = serializeSSEEvent({
            type: 'token',
            executionId,
            content: { text: 'test' },
            agentSlug: 'test-agent',
            sequence: 1,
        });

        const parsed = new Date(result.meta.timestamp);
        expect(parsed.toISOString()).toBe(result.meta.timestamp);
    });

    it('should handle all 12 event types', () => {
        const eventTypes: StreamEventType[] = [
            'meta', 'progress', 'guidance', 'token',
            'tool_call', 'tool_result', 'reasoning',
            'memory_update', 'kb_query', 'self_moderation',
            'context_warning', 'done',
        ];

        for (const type of eventTypes) {
            const result = serializeSSEEvent({
                type,
                executionId,
                content: {},
                agentSlug: 'test-agent',
                sequence: 1,
            });
            expect(result.type).toBe(type);
        }
    });
});

// -----------------------------------------------------------------------------
// Done Event Serialization
// -----------------------------------------------------------------------------

describe('serializeDoneEvent', () => {
    const executionId = 'exec-done-123';

    it('should include final response and summary', () => {
        const summary: ExecutionSummary = {
            totalTokens: 2500,
            durationMs: 8000,
            toolCalls: 3,
            agentsUsed: 1,
        };

        const meta: DoneEventMeta = {
            runId: 42,
            requestId: 'req-123',
            traceId: 'trace-456',
            responseTimeMs: 8000,
        };

        const result = serializeDoneEvent({
            executionId,
            finalResponse: 'Task completed successfully',
            summary,
            meta,
            agentSlug: 'test-agent',
            sequence: 15,
            sessionId: 'sess-abc',
        });

        expect(result.type).toBe('done');
        expect(result.success).toBe(true);
        expect(result.execution_id).toBe(executionId);
        expect(result.content.finalResponse).toBe('Task completed successfully');
        expect(result.content.summary).toEqual(summary);
        expect(result.content.databaseUpdated).toBe(false);
        expect(result.meta.sequence).toBe(15);
        expect(result.meta.agent_slug).toBe('test-agent');
        expect(result.meta.session_id).toBe('sess-abc');
    });

    it('should include output files when provided', () => {
        const result = serializeDoneEvent({
            executionId,
            finalResponse: 'Generated files',
            summary: { totalTokens: 100, durationMs: 500, toolCalls: 1, agentsUsed: 1 },
            meta: { runId: 1, requestId: 'r', traceId: 't', responseTimeMs: 500 },
            agentSlug: 'test-agent',
            sequence: 1,
            outputFiles: ['output/report.pdf', 'output/data.csv'],
        });

        expect(result.content.outputFiles).toEqual(['output/report.pdf', 'output/data.csv']);
    });

    it('should include credits consumed when provided', () => {
        const result = serializeDoneEvent({
            executionId,
            finalResponse: 'Done',
            summary: { totalTokens: 5000, durationMs: 3000, toolCalls: 0, agentsUsed: 1 },
            meta: { runId: 1, requestId: 'r', traceId: 't', responseTimeMs: 3000 },
            agentSlug: 'test-agent',
            sequence: 1,
            creditsConsumed: 4.2,
        });

        expect(result.content.creditsConsumed).toBe(4.2);
    });

    it('should include tool calls summary when provided', () => {
        const toolCallsSummary = [
            { name: 'web_search', count: 2, totalDurationMs: 3000 },
            { name: 'read_file', count: 5, totalDurationMs: 200 },
        ];

        const result = serializeDoneEvent({
            executionId,
            finalResponse: 'Done',
            summary: { totalTokens: 1000, durationMs: 5000, toolCalls: 7, agentsUsed: 1 },
            meta: { runId: 1, requestId: 'r', traceId: 't', responseTimeMs: 5000 },
            agentSlug: 'test-agent',
            sequence: 1,
            toolCallsSummary,
        });

        expect(result.content.toolCallsSummary).toEqual(toolCallsSummary);
    });

    it('should set databaseUpdated when specified', () => {
        const result = serializeDoneEvent({
            executionId,
            summary: { totalTokens: 0, durationMs: 0, toolCalls: 0, agentsUsed: 0 },
            meta: { runId: null, requestId: 'r', traceId: 't', responseTimeMs: 0 },
            agentSlug: 'test-agent',
            sequence: 1,
            databaseUpdated: true,
        });

        expect(result.content.databaseUpdated).toBe(true);
    });
});

// -----------------------------------------------------------------------------
// Non-SSE Endpoint Responses
// -----------------------------------------------------------------------------

describe('serializeExecutionStatus', () => {
    it('should serialize running execution status', () => {
        const result = serializeExecutionStatus({
            executionId: 'exec-status-1',
            status: 'running',
            agentSlug: 'test-agent',
            startedAt: '2025-02-14T10:00:00Z',
            progress: { phase: 'llm_invocation', percent: 50 },
        });

        expect(result.execution_id).toBe('exec-status-1');
        expect(result.status).toBe('running');
        expect(result.agent_slug).toBe('test-agent');
        expect(result.started_at).toBe('2025-02-14T10:00:00Z');
        expect(result.progress).toEqual({ phase: 'llm_invocation', percent: 50 });
        expect(result.completed_at).toBeUndefined();
    });

    it('should serialize completed execution status with summary', () => {
        const result = serializeExecutionStatus({
            executionId: 'exec-status-2',
            status: 'completed',
            agentSlug: 'test-agent',
            startedAt: '2025-02-14T10:00:00Z',
            completedAt: '2025-02-14T10:01:00Z',
            summary: { totalTokens: 5000, durationMs: 60000, toolCalls: 3, agentsUsed: 1 },
        });

        expect(result.status).toBe('completed');
        expect(result.completed_at).toBe('2025-02-14T10:01:00Z');
        expect(result.summary).toBeDefined();
    });

    it('should serialize failed execution status with error', () => {
        const result = serializeExecutionStatus({
            executionId: 'exec-status-3',
            status: 'failed',
            agentSlug: 'test-agent',
            startedAt: '2025-02-14T10:00:00Z',
            completedAt: '2025-02-14T10:00:30Z',
            error: {
                message: 'Timeout exceeded',
                code: 'EXECUTION_TIMEOUT',
                type: 'timeout',
            },
        });

        expect(result.status).toBe('failed');
        expect(result.error).toBeDefined();
        expect(result.error!.code).toBe('EXECUTION_TIMEOUT');
    });

    it('should serialize cancelled execution status', () => {
        const result = serializeExecutionStatus({
            executionId: 'exec-status-4',
            status: 'cancelled',
            agentSlug: 'test-agent',
            startedAt: '2025-02-14T10:00:00Z',
        });

        expect(result.status).toBe('cancelled');
    });
});

describe('serializeHITLAcknowledgment', () => {
    it('should serialize HITL response acknowledgment', () => {
        const result = serializeHITLAcknowledgment({
            executionId: 'exec-hitl-1',
            guidanceId: 'guid-xyz',
            accepted: true,
        });

        expect(result.execution_id).toBe('exec-hitl-1');
        expect(result.guidance_id).toBe('guid-xyz');
        expect(result.accepted).toBe(true);
        expect(result.acknowledged_at).toBeDefined();
    });

    it('should serialize rejected HITL response', () => {
        const result = serializeHITLAcknowledgment({
            executionId: 'exec-hitl-2',
            guidanceId: 'guid-abc',
            accepted: false,
            responseValue: 'no',
        });

        expect(result.accepted).toBe(false);
        expect(result.response_value).toBe('no');
    });
});

describe('serializeCancellationResult', () => {
    it('should serialize graceful cancellation', () => {
        const result = serializeCancellationResult({
            executionId: 'exec-cancel-1',
            cancelled: true,
            method: 'graceful',
        });

        expect(result.execution_id).toBe('exec-cancel-1');
        expect(result.cancelled).toBe(true);
        expect(result.method).toBe('graceful');
        expect(result.cancelled_at).toBeDefined();
    });

    it('should serialize forced cancellation', () => {
        const result = serializeCancellationResult({
            executionId: 'exec-cancel-2',
            cancelled: true,
            method: 'forced',
            reason: 'User requested immediate stop',
        });

        expect(result.method).toBe('forced');
        expect(result.reason).toBe('User requested immediate stop');
    });

    it('should serialize cancellation failure', () => {
        const result = serializeCancellationResult({
            executionId: 'exec-cancel-3',
            cancelled: false,
            method: 'graceful',
            reason: 'Execution already completed',
        });

        expect(result.cancelled).toBe(false);
        expect(result.reason).toBe('Execution already completed');
    });
});

// -----------------------------------------------------------------------------
// Transcript Serialization
// -----------------------------------------------------------------------------

describe('serializeTranscriptPage', () => {
    it('should serialize transcript page with events', () => {
        const events = [
            {
                id: 1,
                execution_id: 'exec-t-1',
                event_type: 'meta' as StreamEventType,
                event_data: { model: 'claude-opus-4-6' },
                sequence_number: 1,
                created_at: '2025-02-14T10:00:00Z',
            },
            {
                id: 2,
                execution_id: 'exec-t-1',
                event_type: 'token' as StreamEventType,
                event_data: { text: 'Hello' },
                sequence_number: 2,
                created_at: '2025-02-14T10:00:01Z',
            },
        ];

        const result = serializeTranscriptPage({
            executionId: 'exec-t-1',
            events,
            total: 10,
            limit: 2,
            offset: 0,
        });

        expect(result.execution_id).toBe('exec-t-1');
        expect(result.events).toHaveLength(2);
        expect(result.events[0].event_type).toBe('meta');
        expect(result.events[1].event_type).toBe('token');
        expect(result.pagination.total).toBe(10);
        expect(result.pagination.limit).toBe(2);
        expect(result.pagination.offset).toBe(0);
        expect(result.pagination.has_more).toBe(true);
    });

    it('should set has_more to false when all events returned', () => {
        const result = serializeTranscriptPage({
            executionId: 'exec-t-2',
            events: [],
            total: 5,
            limit: 100,
            offset: 0,
        });

        expect(result.pagination.has_more).toBe(false);
    });

    it('should calculate has_more correctly with offset', () => {
        const result = serializeTranscriptPage({
            executionId: 'exec-t-3',
            events: [
                {
                    id: 3,
                    execution_id: 'exec-t-3',
                    event_type: 'done' as StreamEventType,
                    event_data: {},
                    sequence_number: 3,
                    created_at: '2025-02-14T10:00:02Z',
                },
            ],
            total: 3,
            limit: 1,
            offset: 2,
        });

        // offset 2, limit 1, total 3: 2 + 1 >= 3 => no more
        expect(result.pagination.has_more).toBe(false);
    });
});

// -----------------------------------------------------------------------------
// Sequence Tracker
// -----------------------------------------------------------------------------

describe('SequenceTracker', () => {
    it('should start at 0', () => {
        const tracker = new SequenceTracker();
        expect(tracker.current()).toBe(0);
    });

    it('should increment and return new value', () => {
        const tracker = new SequenceTracker();
        expect(tracker.next()).toBe(1);
        expect(tracker.next()).toBe(2);
        expect(tracker.next()).toBe(3);
    });

    it('should report current without incrementing', () => {
        const tracker = new SequenceTracker();
        tracker.next();
        tracker.next();
        expect(tracker.current()).toBe(2);
        expect(tracker.current()).toBe(2);
    });

    it('should reset to 0', () => {
        const tracker = new SequenceTracker();
        tracker.next();
        tracker.next();
        tracker.reset();
        expect(tracker.current()).toBe(0);
        expect(tracker.next()).toBe(1);
    });
});
