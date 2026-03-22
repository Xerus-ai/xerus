// Stream Events Factory Tests
// Tests for all 12 event type factory functions

import {
    createMetaEvent,
    createProgressEvent,
    createGuidanceEvent,
    createTokenEvent,
    createToolCallEvent,
    createToolResultEvent,
    createReasoningEvent,
    createMemoryUpdateEvent,
    createKbQueryEvent,
    createSelfModerationEvent,
    createContextWarningEvent,
    createDoneEvent,
    createErrorDoneEvent,
} from '../stream.events';
import { StreamEvent } from '../../types';

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('Stream Event Factories', () => {
    const executionId = 'exec-test-123';

    describe('createMetaEvent', () => {
        it('should create meta event', () => {
            const content = {
                model: 'claude-opus-4-6',
                agentSlug: 'test-agent',
                agentName: 'Code Assistant',
                startedAt: '2025-02-13T10:00:00Z',
            };

            const event = createMetaEvent(executionId, content);

            expect(event.type).toBe('meta');
            expect(event.success).toBe(true);
            expect(event.execution_id).toBe(executionId);
            expect(event.content).toEqual(content);
        });

        it('should include optional meta', () => {
            const content = {
                model: 'claude-opus-4-6',
                agentSlug: 'test-agent',
                agentName: 'Code Assistant',
                startedAt: '2025-02-13T10:00:00Z',
            };

            const event = createMetaEvent(executionId, content, { contextBudget: 128000 });

            expect(event.meta).toEqual({ contextBudget: 128000 });
        });
    });

    describe('createProgressEvent', () => {
        it('should create progress event', () => {
            const content = {
                phase: 'context_assembly',
                message: 'Loading agent memory',
                percent: 25,
            };

            const event = createProgressEvent(executionId, content);

            expect(event.type).toBe('progress');
            expect(event.success).toBe(true);
            expect(event.content).toEqual(content);
        });
    });

    describe('createGuidanceEvent', () => {
        it('should create guidance event', () => {
            const content = {
                question: 'Should I proceed with deletion?',
                options: ['yes', 'no'],
                timeout_seconds: 60,
                pause_id: 'pause-1',
                scenario: 'destructive_action',
                tool_name: 'Bash',
                agent_slug: 'test-agent',
                requires_auth: false,
                execution_id: executionId,
            };

            const event = createGuidanceEvent(executionId, content);

            expect(event.type).toBe('guidance');
            expect(event.success).toBe(true);
            expect(event.content).toEqual(content);
        });
    });

    describe('createTokenEvent', () => {
        it('should create token event', () => {
            const content = {
                text: 'Hello, world!',
                tokenCount: 3,
            };

            const event = createTokenEvent(executionId, content);

            expect(event.type).toBe('token');
            expect(event.success).toBe(true);
            expect(event.content).toEqual(content);
        });
    });

    describe('createToolCallEvent', () => {
        it('should create tool_call event', () => {
            const content = {
                toolName: 'web_search',
                arguments: { query: 'TypeScript best practices' },
                callId: 'call-123',
            };

            const event = createToolCallEvent(executionId, content);

            expect(event.type).toBe('tool_call');
            expect(event.success).toBe(true);
            expect(event.content).toEqual(content);
        });
    });

    describe('createToolResultEvent', () => {
        it('should create tool_result event', () => {
            const content = {
                callId: 'call-123',
                result: { data: 'search results' },
                durationMs: 1500,
                success: true,
            };

            const event = createToolResultEvent(executionId, content);

            expect(event.type).toBe('tool_result');
            expect(event.success).toBe(true);
            expect(event.content).toEqual(content);
        });
    });

    describe('createReasoningEvent', () => {
        it('should create reasoning event', () => {
            const content = {
                thought: 'User needs current information, should use web search.',
                confidence: 0.9,
            };

            const event = createReasoningEvent(executionId, content);

            expect(event.type).toBe('reasoning');
            expect(event.success).toBe(true);
            expect(event.content).toEqual(content);
        });
    });

    describe('createMemoryUpdateEvent', () => {
        it('should create memory_update event', () => {
            const content = {
                operation: 'save' as const,
                scope: 'agent' as const,
                path: 'user_preferences',
            };

            const event = createMemoryUpdateEvent(executionId, content);

            expect(event.type).toBe('memory_update');
            expect(event.success).toBe(true);
            expect(event.content).toEqual(content);
        });
    });

    describe('createKbQueryEvent', () => {
        it('should create kb_query event', () => {
            const content = {
                query: 'authentication best practices',
                resultsCount: 5,
                kbIds: ['kb-1', 'kb-2'],
            };

            const event = createKbQueryEvent(executionId, content);

            expect(event.type).toBe('kb_query');
            expect(event.success).toBe(true);
            expect(event.content).toEqual(content);
        });
    });

    describe('createSelfModerationEvent', () => {
        it('should create self_moderation event', () => {
            const content = {
                checklist: ['relevance', 'accuracy', 'completeness'],
                qualityScore: 4,
                passed: true,
            };

            const event = createSelfModerationEvent(executionId, content);

            expect(event.type).toBe('self_moderation');
            expect(event.success).toBe(true);
            expect(event.content).toEqual(content);
        });
    });

    describe('createContextWarningEvent', () => {
        it('should create context_warning event', () => {
            const content = {
                warningType: 'approaching_limit' as const,
                currentUsage: 96000,
                maxBudget: 128000,
                percentUsed: 75,
            };

            const event = createContextWarningEvent(executionId, content);

            expect(event.type).toBe('context_warning');
            expect(event.success).toBe(true);
            expect(event.content).toEqual(content);
        });
    });

    describe('createDoneEvent', () => {
        it('should create done event with success', () => {
            const content = {
                finalResponse: 'Task completed successfully',
                summary: {
                    totalTokens: 1500,
                    durationMs: 5000,
                    toolCalls: 3,
                    agentsUsed: 1,
                },
                databaseUpdated: true,
            };

            const meta = {
                runId: 42,
                requestId: 'req-123',
                traceId: 'trace-456',
                responseTimeMs: 5000,
            };

            const event = createDoneEvent(executionId, content, meta);

            expect(event.type).toBe('done');
            expect(event.success).toBe(true);
            expect(event.content).toEqual(content);
            expect(event.meta).toEqual(meta);
        });

        it('should support explicit success: false', () => {
            const content = {
                summary: {
                    totalTokens: 0,
                    durationMs: 1000,
                    toolCalls: 0,
                    agentsUsed: 0,
                },
                databaseUpdated: false,
            };

            const meta = {
                runId: null,
                requestId: 'req-123',
                traceId: 'trace-456',
                responseTimeMs: 1000,
                failedAt: 'context_assembly',
            };

            const event = createDoneEvent(executionId, content, meta, { success: false });

            expect(event.success).toBe(false);
        });
    });

    describe('createErrorDoneEvent', () => {
        it('should create error done event', () => {
            const error = {
                message: 'Timeout exceeded',
                code: 'TIMEOUT',
            };

            const meta = {
                runId: null,
                requestId: 'req-123',
                traceId: 'trace-456',
                responseTimeMs: 30000,
            };

            const event = createErrorDoneEvent(executionId, error, meta);

            expect(event.type).toBe('done');
            expect(event.success).toBe(false);
            expect(event.execution_id).toBe(executionId);
            expect((event.content as { error: { message: string } }).error.message).toBe('Timeout exceeded');
            expect((event.content as { error: { code: string } }).error.code).toBe('TIMEOUT');
        });
    });

    describe('all event types', () => {
        it('should have factories for all 12 event types', () => {
            const factories = [
                createMetaEvent,
                createProgressEvent,
                createGuidanceEvent,
                createTokenEvent,
                createToolCallEvent,
                createToolResultEvent,
                createReasoningEvent,
                createMemoryUpdateEvent,
                createKbQueryEvent,
                createSelfModerationEvent,
                createContextWarningEvent,
                createDoneEvent,
            ];

            expect(factories).toHaveLength(12);
        });

        it('should all return valid StreamEvent shape', () => {
            const events: StreamEvent[] = [
                createMetaEvent(executionId, {
                    model: 'test',
                    agentSlug: 'test-agent',
                    agentName: 'Test',
                    startedAt: new Date().toISOString(),
                }),
                createProgressEvent(executionId, { phase: 'test', message: 'msg', percent: 0 }),
                createGuidanceEvent(executionId, {
                    question: 'test?',
                    pause_id: 'pause-1',
                    scenario: 'test',
                    tool_name: 'Bash',
                    agent_slug: 'test-agent',
                    requires_auth: false,
                    execution_id: executionId,
                }),
                createTokenEvent(executionId, { text: 'test', tokenCount: 1 }),
                createToolCallEvent(executionId, {
                    toolName: 'test',
                    arguments: {},
                    callId: 'call-1',
                }),
                createToolResultEvent(executionId, {
                    callId: 'call-1',
                    result: null,
                    durationMs: 0,
                    success: true,
                }),
                createReasoningEvent(executionId, { thought: 'thinking...' }),
                createMemoryUpdateEvent(executionId, {
                    operation: 'save',
                    scope: 'agent',
                    path: 'working/state',
                }),
                createKbQueryEvent(executionId, { query: 'test', resultsCount: 0, kbIds: [] }),
                createSelfModerationEvent(executionId, {
                    checklist: [],
                    qualityScore: 5,
                    passed: true,
                }),
                createContextWarningEvent(executionId, {
                    warningType: 'approaching_limit',
                    currentUsage: 0,
                    maxBudget: 100,
                    percentUsed: 0,
                }),
                createDoneEvent(
                    executionId,
                    {
                        summary: {
                            totalTokens: 0,
                            durationMs: 0,
                            toolCalls: 0,
                            agentsUsed: 0,
                        },
                        databaseUpdated: false,
                    },
                    {
                        runId: null,
                        requestId: 'req-1',
                        traceId: 'trace-1',
                        responseTimeMs: 0,
                    }
                ),
            ];

            for (const event of events) {
                expect(event).toHaveProperty('type');
                expect(event).toHaveProperty('success');
                expect(event).toHaveProperty('execution_id');
                expect(typeof event.type).toBe('string');
                expect(typeof event.success).toBe('boolean');
                expect(event.execution_id).toBe(executionId);
            }
        });
    });
});
