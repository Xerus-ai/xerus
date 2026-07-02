// Execution Pipeline Resilience Tests
// Verifies that the event loop survives non-fatal handler failures, propagates
// PipelineInvariantError immediately, and escalates after MAX_CONSECUTIVE_HANDLER_ERRORS.
// Uses in-memory implementations (no jest.mock) per project conventions.

import {
    routeEventWithResilience,
    createResilienceState,
    MAX_CONSECUTIVE_HANDLER_ERRORS,
} from '../event-resilience';
import { PipelineInvariantError } from '../errors';
import type {
    PipelineContext,
    ResolvedExecutionDeps,
    AgentRow,
    ExecutionDatabase,
} from '../execution-pipeline.types';
import type { StreamEventType } from '../types';
import { CreditTracker, type CreditService, type UsageStore, type ToolUsageRecord, type SessionUsage } from '../../credits/credit-tracker.service';

// -----------------------------------------------------------------------------
// In-Memory Implementations (real objects, not mocks)
// -----------------------------------------------------------------------------

class FailingDatabase implements ExecutionDatabase {
    public failureCount = 0;

    async query<T>(_sql: string, _params?: unknown[]): Promise<{ rows: T[] }> {
        this.failureCount++;
        throw new Error('database unavailable');
    }
}

class HealthyDatabase implements ExecutionDatabase {
    public queries: Array<{ sql: string; params: unknown[] }> = [];

    async query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
        this.queries.push({ sql, params: params || [] });
        return { rows: [] as T[] };
    }
}

// Throws a PostgreSQL schema error (undefined table). SQLSTATE class 42 marks a
// query/schema bug — a programmer error the wrapper must surface, not degrade.
class SchemaErrorDatabase implements ExecutionDatabase {
    async query<T>(_sql: string, _params?: unknown[]): Promise<{ rows: T[] }> {
        const err = new Error('relation "workspaces" does not exist') as Error & { code: string };
        err.code = '42P01';
        throw err;
    }
}

// Throws a TypeError, standing in for a code defect that surfaces inside a
// handler (e.g. calling an undefined function). Must be surfaced, not degraded.
class TypeErrorDatabase implements ExecutionDatabase {
    async query<T>(_sql: string, _params?: unknown[]): Promise<{ rows: T[] }> {
        throw new TypeError('deps.provider.run is not a function');
    }
}

class InMemoryCreditService implements CreditService {
    public currentBalance = 100;

    async checkCredits(_userId: string, required: number): Promise<boolean> {
        return this.currentBalance >= required;
    }

    async deduct(_userId: string, input: { amount: number }): Promise<{ balance: number }> {
        this.currentBalance -= input.amount;
        return { balance: this.currentBalance };
    }

    async refund(_userId: string, amount: number): Promise<{ balance: number }> {
        this.currentBalance += amount;
        return { balance: this.currentBalance };
    }

    async getBalance(_userId: string): Promise<{ balance: number }> {
        return { balance: this.currentBalance };
    }
}

class InMemoryUsageStore implements UsageStore {
    public records: ToolUsageRecord[] = [];

    async storeToolUsage(record: ToolUsageRecord): Promise<void> {
        this.records.push(record);
    }

    async getSessionUsage(sessionId: string): Promise<SessionUsage> {
        return {
            session_id: sessionId,
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_credits: 0,
            tool_calls: 0,
        };
    }
}

class FakeStream {
    public sentEvents: Array<{ type: string; content: unknown; meta: unknown }> = [];
    public closed = false;

    send(type: StreamEventType, content: unknown, meta?: unknown): void {
        this.sentEvents.push({ type, content, meta });
    }

    isClosed(): boolean {
        return this.closed;
    }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function createTestAgent(): AgentRow {
    return {
        id: 42,
        name: 'Test Agent',
        slug: 'test-agent',
        description: 'A test agent',
        ai_model: 'claude-sonnet-4-5-20250929',
        thinking_level: 'medium',
        autonomy_level: 'supervised',
        adapter_type: 'claudecode',
        primary_use_case: 'testing',
        workspace_id: 'ws-001',
        user_id: 'user-123',
    };
}

function createTestContext(overrides?: Partial<PipelineContext>): PipelineContext {
    const stream = new FakeStream();
    return {
        executionId: 'exec-001',
        stream: stream as unknown as PipelineContext['stream'],
        request: {
            userId: 'user-123',
            agentSlug: 'test-agent',
            task: 'test task',
            coordinationMode: 'sequential',
        } as PipelineContext['request'],
        agent: createTestAgent(),
        sandboxId: 'sbx-001',
        sessionHandle: null,
        laneId: null,
        startedAt: Date.now(),
        sessionId: 'session-001',
        inputTokens: 0,
        outputTokens: 0,
        toolCallCount: 0,
        status: 'running',
        streamOffset: 0,
        conversationId: null,
        sdkSessionId: null,
        responseText: '',
        responseChunks: [],
        creditsUsed: 0,
        keySource: null,
        subscriptionStatus: null,
        subscriptionPeriodEnd: null,
        agentSessionCount: 0,
        announceQueue: null,
        thinkingChunks: [],
        toolCallDetails: [],
        toolCallMap: new Map(),
        eventsFiltered: 0,
        setupReport: null,
        hookHealth: null,
        triggerType: 'user_message',
        executionFailed: false,
        executionError: null,
        ...overrides,
    };
}

function createDeps(db: ExecutionDatabase): ResolvedExecutionDeps {
    const creditService = new InMemoryCreditService();
    const usageStore = new InMemoryUsageStore();
    const creditTracker = new CreditTracker({ creditService, usageStore });

    return {
        db,
        creditTracker,
        sdkService: {} as ResolvedExecutionDeps['sdkService'],
        sandboxService: {} as ResolvedExecutionDeps['sandboxService'],
        queueService: {} as ResolvedExecutionDeps['queueService'],
        memorySearchIndex: null,
        messageBridge: null,
        hitlHandler: { requestApproval: async () => ({}), resolveApproval: async () => ({}) } as unknown as ResolvedExecutionDeps['hitlHandler'],
        activeStreamEmitter: null,
    };
}

function getStream(ctx: PipelineContext): FakeStream {
    return ctx.stream as unknown as FakeStream;
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('routeEventWithResilience', () => {
    // sandbox_lifecycle routes straight through deps.db.query with no other
    // dependency, so the injected database controls exactly which error surfaces.
    const sandboxLifecycleEvent = { data: { sandbox_id: 'sbx-001', action: 'start' } };

    describe('transient handler errors (degraded, never swallowed)', () => {
        it('does not re-throw when a handler fails for a transient reason', async () => {
            const ctx = createTestContext();
            const deps = createDeps(new FailingDatabase());
            const state = createResilienceState();

            await expect(
                routeEventWithResilience('sandbox_lifecycle', sandboxLifecycleEvent, ctx, deps, state),
            ).resolves.toBeUndefined();

            expect(state.consecutiveErrors).toBe(1);
        });

        it('surfaces a transient failure as an error notification (never silent)', async () => {
            const ctx = createTestContext();
            const deps = createDeps(new FailingDatabase());
            const state = createResilienceState();

            await routeEventWithResilience('sandbox_lifecycle', sandboxLifecycleEvent, ctx, deps, state);

            const notifications = getStream(ctx).sentEvents.filter(e => e.type === 'notification');
            expect(notifications).toHaveLength(1);
            const content = notifications[0].content as { priority: string; message: string };
            expect(content.priority).toBe('error');
            expect(content.message).toMatch(/agent is still running/i);
        });

        it('still counts the error when the stream is already closed', async () => {
            const ctx = createTestContext();
            const stream = getStream(ctx);
            stream.closed = true;
            const deps = createDeps(new FailingDatabase());
            const state = createResilienceState();

            await routeEventWithResilience('sandbox_lifecycle', sandboxLifecycleEvent, ctx, deps, state);

            expect(stream.sentEvents).toHaveLength(0);
            expect(state.consecutiveErrors).toBe(1);
        });

        it('resets consecutiveErrors after a successful event', async () => {
            const ctx = createTestContext();
            const deps = createDeps(new HealthyDatabase());
            const state = createResilienceState();
            state.consecutiveErrors = 3;

            // credit_usage succeeds with no external dependency.
            await routeEventWithResilience(
                'credit_usage',
                { data: { credits_consumed: 5 } },
                ctx,
                deps,
                state,
            );

            expect(state.consecutiveErrors).toBe(0);
        });
    });

    describe('programmer errors (fail-fast, surfaced not swallowed)', () => {
        it('re-throws a database schema error (undefined table, SQLSTATE 42P01)', async () => {
            const ctx = createTestContext();
            const deps = createDeps(new SchemaErrorDatabase());
            const state = createResilienceState();

            await expect(
                routeEventWithResilience('sandbox_lifecycle', sandboxLifecycleEvent, ctx, deps, state),
            ).rejects.toThrow(/does not exist/);

            expect(state.consecutiveErrors).toBe(0);
            expect(getStream(ctx).sentEvents.filter(e => e.type === 'notification')).toHaveLength(0);
        });

        it('re-throws a TypeError (undefined function) without degrading', async () => {
            const ctx = createTestContext();
            const deps = createDeps(new TypeErrorDatabase());
            const state = createResilienceState();

            await expect(
                routeEventWithResilience('sandbox_lifecycle', sandboxLifecycleEvent, ctx, deps, state),
            ).rejects.toBeInstanceOf(TypeError);

            expect(state.consecutiveErrors).toBe(0);
            expect(getStream(ctx).sentEvents.filter(e => e.type === 'notification')).toHaveLength(0);
        });
    });

    describe('PipelineInvariantError fatal handling', () => {
        const agentMessageData = {
            data: { agent_slug: 'test-agent', channel: 'general', content: 'hi' },
        };

        it('re-throws when sandboxId is missing, without degradation or notification', async () => {
            const ctx = createTestContext({ sandboxId: null });
            const deps = createDeps(new HealthyDatabase());
            // Bypass the messageBridge guard so we reach the sandboxId guard.
            deps.messageBridge = {
                handleOutboundMessage: async () => ({ message_id: 'm1', channel_id: 'c1' }),
            } as unknown as ResolvedExecutionDeps['messageBridge'];
            const state = createResilienceState();

            await expect(
                routeEventWithResilience('agent_message', agentMessageData, ctx, deps, state),
            ).rejects.toBeInstanceOf(PipelineInvariantError);

            expect(state.consecutiveErrors).toBe(0);
            const notifications = getStream(ctx).sentEvents.filter(e => e.type === 'notification');
            expect(notifications).toHaveLength(0);
        });

        it('re-throws when messageBridge is missing', async () => {
            const ctx = createTestContext();
            const deps = createDeps(new HealthyDatabase());
            expect(deps.messageBridge).toBeNull();
            const state = createResilienceState();

            await expect(
                routeEventWithResilience('agent_message', agentMessageData, ctx, deps, state),
            ).rejects.toBeInstanceOf(PipelineInvariantError);
        });
    });

    describe('escalation after MAX_CONSECUTIVE_HANDLER_ERRORS', () => {
        it('escalates to fatal after 5 transient failures in a row, without an extra notification', async () => {
            expect(MAX_CONSECUTIVE_HANDLER_ERRORS).toBe(5);

            const ctx = createTestContext();
            const deps = createDeps(new FailingDatabase());
            const state = createResilienceState();
            const stream = getStream(ctx);

            // First (MAX - 1) calls degrade and emit one notification each.
            for (let i = 0; i < MAX_CONSECUTIVE_HANDLER_ERRORS - 1; i++) {
                await expect(
                    routeEventWithResilience('sandbox_lifecycle', sandboxLifecycleEvent, ctx, deps, state),
                ).resolves.toBeUndefined();
            }
            expect(state.consecutiveErrors).toBe(MAX_CONSECUTIVE_HANDLER_ERRORS - 1);
            const notificationsBefore = stream.sentEvents.filter(e => e.type === 'notification').length;
            expect(notificationsBefore).toBe(MAX_CONSECUTIVE_HANDLER_ERRORS - 1);

            // The MAXth call must re-throw and NOT emit a notification.
            await expect(
                routeEventWithResilience('sandbox_lifecycle', sandboxLifecycleEvent, ctx, deps, state),
            ).rejects.toThrow('database unavailable');

            expect(state.consecutiveErrors).toBe(MAX_CONSECUTIVE_HANDLER_ERRORS);
            const notificationsAfter = stream.sentEvents.filter(e => e.type === 'notification').length;
            expect(notificationsAfter).toBe(MAX_CONSECUTIVE_HANDLER_ERRORS - 1);
        });
    });
});
