// Runner Event Router Tests — extractData, tool_call, session_ended, credit_usage, sse_forward
// DB write handlers and metadata_sync: runner-event-router-handlers.test.ts

import {
    routeEventToBackend,
    VALID_SSE_FORWARD_EVENTS,
} from '../runner-event-router';
import {
    createTestContext,
    createTestDeps,
    getStream,
} from './runner-event-router-test-deps';

describe('routeEventToBackend', () => {
    describe('extractData (data shape fix)', () => {
        it('should merge raw.data into root for consistent field access', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            await routeEventToBackend('credit_usage', {
                event: 'credit_usage',
                agent_slug: 'x',
                data: { credits_consumed: 5 },
            }, ctx, deps);

            expect(ctx.creditsUsed).toBe(5);
        });

        it('should handle events without data wrapper', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            await routeEventToBackend('credit_usage', {
                credits_consumed: 3,
            }, ctx, deps);

            expect(ctx.creditsUsed).toBe(3);
        });

        it('should handle data field that is not an object', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            await routeEventToBackend('tool_call', {
                data: 'not-an-object',
            }, ctx, deps);

            expect(ctx.toolCallCount).toBe(1);
        });
    });

    describe('tool_call', () => {
        it('should increment toolCallCount', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            await routeEventToBackend('tool_call', {}, ctx, deps);
            await routeEventToBackend('tool_call', {}, ctx, deps);
            await routeEventToBackend('tool_call', {}, ctx, deps);

            expect(ctx.toolCallCount).toBe(3);
        });
    });

    describe('session_ended', () => {
        it('should extract input_tokens and output_tokens from usage field', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            await routeEventToBackend('session_ended', {
                data: { usage: { input_tokens: 1500, output_tokens: 3000, total_tokens: 4500 } },
            }, ctx, deps);

            expect(ctx.inputTokens).toBe(1500);
            expect(ctx.outputTokens).toBe(3000);
        });

        it('should handle done event same as session_ended', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            await routeEventToBackend('done', {
                data: { usage: { input_tokens: 300, output_tokens: 400, total_tokens: 700 } },
            }, ctx, deps);

            expect(ctx.inputTokens).toBe(300);
            expect(ctx.outputTokens).toBe(400);
        });

        it('should preserve existing tokens when new values are falsy', async () => {
            const ctx = createTestContext({ inputTokens: 100, outputTokens: 200 });
            const { deps } = createTestDeps();

            await routeEventToBackend('session_ended', {
                data: { usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } },
            }, ctx, deps);

            expect(ctx.inputTokens).toBe(100);
            expect(ctx.outputTokens).toBe(200);
        });

        it('should handle missing usage field gracefully', async () => {
            const ctx = createTestContext({ inputTokens: 50, outputTokens: 75 });
            const { deps } = createTestDeps();

            await routeEventToBackend('session_ended', {
                data: { success: true },
            }, ctx, deps);

            expect(ctx.inputTokens).toBe(50);
            expect(ctx.outputTokens).toBe(75);
        });
    });

    describe('credit_usage', () => {
        it('should accumulate credits for positive amounts', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            await routeEventToBackend('credit_usage', { data: { credits_consumed: 10 } }, ctx, deps);
            expect(ctx.creditsUsed).toBe(10);
        });

        it('should not accumulate for zero credits', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            await routeEventToBackend('credit_usage', { data: { credits_consumed: 0 } }, ctx, deps);
            expect(ctx.creditsUsed).toBe(0);
        });

        it('should not accumulate for negative credits', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            await routeEventToBackend('credit_usage', { data: { credits_consumed: -5 } }, ctx, deps);
            expect(ctx.creditsUsed).toBe(0);
        });

        it('should not accumulate when credits_consumed is missing', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            await routeEventToBackend('credit_usage', { data: {} }, ctx, deps);
            expect(ctx.creditsUsed).toBe(0);
        });
    });

    describe('update_agent_run', () => {
        it('should warn only (agent_runs table dropped)', async () => {
            const ctx = createTestContext();
            const { deps, db } = createTestDeps();
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await routeEventToBackend('update_agent_run', {
                data: { run_id: 'run-001', status: 'completed' },
            }, ctx, deps);

            expect(db.queries).toHaveLength(0);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('update_agent_run'));
            warnSpy.mockRestore();
        });
    });

    describe('sse_forward', () => {
        it('should forward valid SSE events to stream', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            await routeEventToBackend('sse_forward', {
                data: { sse_event: 'progress', payload: { text: 'working...' }, meta: { step: 1 } },
            }, ctx, deps);

            const stream = getStream(ctx);
            expect(stream.sentEvents).toHaveLength(1);
            expect(stream.sentEvents[0].type).toBe('progress');
        });

        it('should reject invalid SSE event types', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            await routeEventToBackend('sse_forward', {
                data: { sse_event: 'not_a_valid_event' },
            }, ctx, deps);

            const stream = getStream(ctx);
            expect(stream.sentEvents).toHaveLength(0);
        });

        it('should throw when sse_event is missing', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            await expect(routeEventToBackend('sse_forward', {
                data: { payload: 'some data' },
            }, ctx, deps)).rejects.toThrow('sse_forward');
        });

        it('should forward all valid event types from STREAM_EVENT_TYPES', () => {
            const expected = ['meta', 'progress', 'token', 'tool_call', 'tool_result',
                'reasoning', 'memory_update', 'kb_query', 'self_moderation',
                'context_warning', 'done', 'stop', 'guidance', 'notification', 'tool_auth_required',
                'subagent_start', 'subagent_stop', 'delegation', 'file_changed',
                'preview', 'credit_warning', 'insufficient_credits', 'provider_unavailable',
                'tool_progress', 'tool_use_summary', 'task_started', 'task_progress',
                'task_updated', 'task_notification', 'agent_message'];
            for (const event of expected) {
                expect(VALID_SSE_FORWARD_EVENTS.has(event)).toBe(true);
            }
            expect(VALID_SSE_FORWARD_EVENTS.size).toBe(30);
        });
    });
});
