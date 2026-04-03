// Runner Event Router Tests
// Tests all 27 event type handlers and the extractData data shape fix.
// Uses in-memory fakes (not jest.mock) per project conventions.

import {
    routeEventToBackend,
    VALID_SSE_FORWARD_EVENTS,
    EVENT_ROUTER_LOG_PREFIX,
} from '../runner-event-router';
import type { PipelineContext, ResolvedExecutionDeps, AgentRow, ExecutionDatabase } from '../execution-pipeline.types';
import type { StreamEventType } from '../types';
import {
    CreditTracker,
    type CreditService,
    type UsageStore,
    type ToolUsageRecord,
    type SessionUsage,
} from '../credits/credit-tracker.service';
import { ChannelNotFoundError } from '../../inbox/messaging';

// -----------------------------------------------------------------------------
// In-Memory Implementations (real objects, not mocks)
// -----------------------------------------------------------------------------

class InMemoryDatabase implements ExecutionDatabase {
    public queries: Array<{ sql: string; params: unknown[] }> = [];
    public nextResult: { rows: unknown[] } = { rows: [] };

    async query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
        this.queries.push({ sql, params: params || [] });
        return this.nextResult as { rows: T[] };
    }

    getLastQuery(): { sql: string; params: unknown[] } | undefined {
        return this.queries[this.queries.length - 1];
    }

    clear(): void {
        this.queries = [];
        this.nextResult = { rows: [] };
    }
}

class InMemoryCreditService implements CreditService {
    public deductions: Array<{ userId: string; amount: number }> = [];
    public currentBalance = 100;

    async checkCredits(_userId: string, required: number): Promise<boolean> {
        return this.currentBalance >= required;
    }

    async deduct(userId: string, input: { amount: number }): Promise<{ balance: number }> {
        this.deductions.push({ userId, amount: input.amount });
        this.currentBalance -= input.amount;
        return { balance: this.currentBalance };
    }

    async refund(_userId: string, amount: number, _description?: string): Promise<{ balance: number }> {
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
        const sessionRecords = this.records.filter(r => r.session_id === sessionId);
        return {
            session_id: sessionId,
            total_input_tokens: sessionRecords.reduce((sum, r) => sum + (r.tokens_used || 0), 0),
            total_output_tokens: 0,
            total_credits: sessionRecords.reduce((sum, r) => sum + (r.credits_consumed || 0), 0),
            tool_calls: sessionRecords.length,
        };
    }
}

class FakeStream {
    public sentEvents: Array<{ type: string; content: unknown; meta: unknown }> = [];

    send(type: StreamEventType, content: unknown, meta?: unknown): void {
        this.sentEvents.push({ type, content, meta });
    }

    isClosed(): boolean {
        return false;
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
        agentSessionCount: 0,
        announceQueue: null,
        thinkingChunks: [],
        toolCallDetails: [],
        eventsFiltered: 0,
        setupReport: null,
        hookHealth: null,
        triggerType: 'user_message',
        ...overrides,
    };
}

interface TestDeps {
    deps: ResolvedExecutionDeps;
    db: InMemoryDatabase;
    creditService: InMemoryCreditService;
    creditTracker: CreditTracker;
}

function createTestDeps(db?: InMemoryDatabase): TestDeps {
    const inMemoryDb = db || new InMemoryDatabase();
    const creditService = new InMemoryCreditService();
    const usageStore = new InMemoryUsageStore();
    const creditTracker = new CreditTracker({ creditService, usageStore });

    const deps: ResolvedExecutionDeps = {
        db: inMemoryDb,
        creditTracker,
        // sdkService, sandboxService, queueService are never
        // accessed by the event router. Safe to leave as empty stubs.
        sdkService: {} as ResolvedExecutionDeps['sdkService'],
        sandboxService: {} as ResolvedExecutionDeps['sandboxService'],
        queueService: {} as ResolvedExecutionDeps['queueService'],
        memorySearchIndex: null,
        messageBridge: null,
        hitlHandler: { requestApproval: async () => ({}), resolveApproval: async () => ({}) } as unknown as ResolvedExecutionDeps['hitlHandler'],
        activeStreamEmitter: null,
    };
    return { deps, db: inMemoryDb, creditService, creditTracker };
}

function getStream(ctx: PipelineContext): FakeStream {
    return ctx.stream as unknown as FakeStream;
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('routeEventToBackend', () => {
    // --- extractData (data shape fix) ---

    describe('extractData (data shape fix)', () => {
        it('should merge raw.data into root for consistent field access', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            // StdoutEmitter wraps: {"event":"credit_usage","agent_slug":"x","data":{"credits_consumed":5}}
            await routeEventToBackend('credit_usage', {
                event: 'credit_usage',
                agent_slug: 'x',
                data: { credits_consumed: 5 },
            }, ctx, deps);

            // credit_usage now accumulates on ctx.creditsUsed (deduction happens at finalize)
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

            // data is a string, not an object - should not merge
            await routeEventToBackend('tool_call', {
                data: 'not-an-object',
            }, ctx, deps);

            expect(ctx.toolCallCount).toBe(1);
        });
    });

    // --- Category A: Existing handlers ---

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

            // StdoutEmitter.sessionEnded() emits data.usage = {input_tokens, output_tokens, total_tokens}
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

            await routeEventToBackend('credit_usage', {
                data: { credits_consumed: 10 },
            }, ctx, deps);

            expect(ctx.creditsUsed).toBe(10);
        });

        it('should not accumulate for zero credits', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            await routeEventToBackend('credit_usage', {
                data: { credits_consumed: 0 },
            }, ctx, deps);

            expect(ctx.creditsUsed).toBe(0);
        });

        it('should not accumulate for negative credits', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            await routeEventToBackend('credit_usage', {
                data: { credits_consumed: -5 },
            }, ctx, deps);

            expect(ctx.creditsUsed).toBe(0);
        });

        it('should not accumulate when credits_consumed is missing', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            await routeEventToBackend('credit_usage', {
                data: {},
            }, ctx, deps);

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
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('update_agent_run'),
            );

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
            expect(stream.sentEvents[0].content).toEqual({ text: 'working...' });
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

        it('should skip when sse_event is missing', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();

            await routeEventToBackend('sse_forward', {
                data: { payload: 'some data' },
            }, ctx, deps);

            const stream = getStream(ctx);
            expect(stream.sentEvents).toHaveLength(0);
        });

        it('should forward all valid event types from STREAM_EVENT_TYPES', () => {
            const expected = ['meta', 'progress', 'token', 'tool_call', 'tool_result',
                'reasoning', 'memory_update', 'kb_query', 'self_moderation',
                'context_warning', 'done', 'stop', 'guidance', 'notification', 'tool_auth_required',
                'subagent_start', 'subagent_stop', 'delegation', 'file_changed'];
            for (const event of expected) {
                expect(VALID_SSE_FORWARD_EVENTS.has(event)).toBe(true);
            }
            expect(VALID_SSE_FORWARD_EVENTS.size).toBe(19);
        });
    });

    // --- Category B: DB write handlers ---

    describe('create_inbox_item', () => {
        it('should insert inbox item with correct fields', async () => {
            const ctx = createTestContext();
            const { deps, db } = createTestDeps();

            await routeEventToBackend('create_inbox_item', {
                data: { channel: 'ch-001', content: 'Task completed', priority: 'high' },
            }, ctx, deps);

            expect(db.queries).toHaveLength(1);
            const q = db.getLastQuery()!;
            expect(q.sql).toContain('INSERT INTO inbox_items');
            expect(q.params[0]).toBe('user-123'); // userId
            expect(q.params[1]).toBe('ch-001');   // channel_id
            expect(q.params[2]).toBe('test-agent'); // agent_slug
            expect(q.params[5]).toBe('Task completed'); // content
            expect(q.params[6]).toBe('high');       // priority
        });

        it('should default priority to normal', async () => {
            const ctx = createTestContext();
            const { deps, db } = createTestDeps();

            await routeEventToBackend('create_inbox_item', {
                data: { content: 'No priority specified' },
            }, ctx, deps);

            const q = db.getLastQuery()!;
            expect(q.params[6]).toBe('normal');
        });

        it('should truncate long content for title', async () => {
            const ctx = createTestContext();
            const { deps, db } = createTestDeps();
            const longContent = 'A'.repeat(100);

            await routeEventToBackend('create_inbox_item', {
                data: { content: longContent },
            }, ctx, deps);

            const q = db.getLastQuery()!;
            const title = q.params[3] as string;
            expect(title.length).toBe(80);
            expect(title.endsWith('...')).toBe(true);
        });

        it('should not truncate short content for title', async () => {
            const ctx = createTestContext();
            const { deps, db } = createTestDeps();

            await routeEventToBackend('create_inbox_item', {
                data: { content: 'Short' },
            }, ctx, deps);

            const q = db.getLastQuery()!;
            expect(q.params[3]).toBe('Short');
        });

        it('should skip when content is missing', async () => {
            const ctx = createTestContext();
            const { deps, db } = createTestDeps();

            await routeEventToBackend('create_inbox_item', {
                data: { channel: 'ch-001' },
            }, ctx, deps);

            expect(db.queries).toHaveLength(0);
        });

        it('should use null for missing channel', async () => {
            const ctx = createTestContext();
            const { deps, db } = createTestDeps();

            await routeEventToBackend('create_inbox_item', {
                data: { content: 'No channel' },
            }, ctx, deps);

            const q = db.getLastQuery()!;
            expect(q.params[1]).toBeNull();
        });
    });

    describe('agent_message', () => {
        it('should delegate to messageBridge.handleOutboundMessage with userId', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();
            const calls: Array<{ userId: string; message: unknown }> = [];
            deps.messageBridge = {
                handleOutboundMessage: async (userId: string, message: unknown) => {
                    calls.push({ userId, message });
                    return { message_id: 'msg-001', channel_id: 'ch-001' };
                },
            } as unknown as ResolvedExecutionDeps['messageBridge'];

            await routeEventToBackend('agent_message', {
                data: { channel: 'general', content: 'Hello team!', agent_slug: 'writer', project: 'marketing' },
            }, ctx, deps);

            expect(calls).toHaveLength(1);
            expect(calls[0].userId).toBe('user-123');
            expect(calls[0].message).toEqual({
                agent_slug: 'writer',
                project: 'marketing',
                channel: 'general',
                content: 'Hello team!',
                message_type: 'chat',
                metadata: undefined,
            });
        });

        it('should throw when messageBridge is not available', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();
            deps.messageBridge = null;

            await expect(routeEventToBackend('agent_message', {
                data: { channel: 'general', content: 'Hello' },
            }, ctx, deps)).rejects.toThrow('messageBridge not initialized');
        });

        it('should warn when messageBridge throws ChannelNotFoundError', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();
            deps.messageBridge = {
                handleOutboundMessage: async () => {
                    throw new ChannelNotFoundError('marketing', 'general');
                },
            } as unknown as ResolvedExecutionDeps['messageBridge'];
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await routeEventToBackend('agent_message', {
                data: { channel: 'general', content: 'Hello', project: 'marketing' },
            }, ctx, deps);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Channel not found: marketing/general'),
            );
            warnSpy.mockRestore();
        });

        it('should skip when channel is missing', async () => {
            const ctx = createTestContext();
            const { deps, db } = createTestDeps();

            await routeEventToBackend('agent_message', {
                data: { content: 'No channel' },
            }, ctx, deps);

            expect(db.queries).toHaveLength(0);
        });

        it('should skip when content is missing', async () => {
            const ctx = createTestContext();
            const { deps, db } = createTestDeps();

            await routeEventToBackend('agent_message', {
                data: { channel: 'general' },
            }, ctx, deps);

            expect(db.queries).toHaveLength(0);
        });
    });

    describe('hook_log', () => {
        it('should insert hook execution into DB', async () => {
            const ctx = createTestContext({ sessionId: 'session-001' });
            const { deps, db } = createTestDeps();

            await routeEventToBackend('hook_log', {
                data: { hook_event: 'PreToolUse', duration_ms: 15, success: true },
            }, ctx, deps);

            expect(db.queries).toHaveLength(1);
            const q = db.getLastQuery()!;
            expect(q.sql).toContain('INSERT INTO hook_executions');
            expect(q.params[0]).toBe('session-001');
            expect(q.params[1]).toBe('PreToolUse');
            expect(q.params[2]).toBe('test-agent');  // agent_slug
            expect(q.params[3]).toBe('user-123');    // user_id
            expect(q.params[6]).toBe(false);          // blocked = !success
            expect(q.params[7]).toBe(15);             // duration_ms
        });

        it('should set blocked=true when success is false', async () => {
            const ctx = createTestContext({ sessionId: 'session-001' });
            const { deps, db } = createTestDeps();

            await routeEventToBackend('hook_log', {
                data: { hook_event: 'PreToolUse', success: false, error: 'denied' },
            }, ctx, deps);

            const q = db.getLastQuery()!;
            expect(q.params[6]).toBe(true); // blocked = !false = true
        });

        it('should log instead of DB insert when sessionId is empty', async () => {
            const ctx = createTestContext({ sessionId: '' });
            const { deps, db } = createTestDeps();
            const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

            await routeEventToBackend('hook_log', {
                data: { hook_event: 'PreToolUse' },
            }, ctx, deps);

            expect(db.queries).toHaveLength(0);
            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('hook_log'),
            );

            logSpy.mockRestore();
        });
    });

    describe('subagent_failure', () => {
        it('should log event (table does not exist yet)', async () => {
            const ctx = createTestContext();
            const { deps, db } = createTestDeps();
            const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

            await routeEventToBackend('subagent_failure', {
                data: { subagent_type: 'researcher', error_message: 'timeout' },
            }, ctx, deps);

            // No DB queries - table doesn't exist
            expect(db.queries).toHaveLength(0);
            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('subagent_failure'),
            );

            logSpy.mockRestore();
        });
    });

    describe('sandbox_lifecycle', () => {
        it('should update sandbox status for known actions', async () => {
            const actionMap: Record<string, string> = {
                start: 'running',
                stop: 'paused',
                archive: 'archived',
                delete: 'stopped',
                restore: 'running',
            };

            for (const [action, expectedStatus] of Object.entries(actionMap)) {
                const ctx = createTestContext();
                const db = new InMemoryDatabase();
                const { deps } = createTestDeps(db);
                deps.sandboxService = {
                    invalidateRegistryCache: (_userId: string) => {},
                } as unknown as ResolvedExecutionDeps['sandboxService'];

                await routeEventToBackend('sandbox_lifecycle', {
                    data: { sandbox_id: 'sbx-001', action },
                }, ctx, deps);

                expect(db.queries).toHaveLength(1);
                const q = db.getLastQuery()!;
                expect(q.sql).toContain('UPDATE workspaces');
                expect(q.params[0]).toBe('sbx-001');
                expect(q.params[1]).toBe(expectedStatus);
                expect(q.params[2]).toBe('user-123'); // user_id
            }
        });

        it('should log unknown actions', async () => {
            const ctx = createTestContext();
            const { deps, db } = createTestDeps();
            const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

            await routeEventToBackend('sandbox_lifecycle', {
                data: { sandbox_id: 'sbx-001', action: 'unknown_action' },
            }, ctx, deps);

            expect(db.queries).toHaveLength(0);
            expect(logSpy).toHaveBeenCalled();

            logSpy.mockRestore();
        });

        it('should skip when sandbox_id is missing', async () => {
            const ctx = createTestContext();
            const { deps, db } = createTestDeps();
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await routeEventToBackend('sandbox_lifecycle', {
                data: { action: 'start' },
            }, ctx, deps);

            expect(db.queries).toHaveLength(0);
            warnSpy.mockRestore();
        });

        it('should skip when action is missing', async () => {
            const ctx = createTestContext();
            const { deps, db } = createTestDeps();
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await routeEventToBackend('sandbox_lifecycle', {
                data: { sandbox_id: 'sbx-001' },
            }, ctx, deps);

            expect(db.queries).toHaveLength(0);
            warnSpy.mockRestore();
        });
    });

    // --- Category B: metadata_sync validation ---

    describe('metadata_sync', () => {
        it('should warn for unsupported entities', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await routeEventToBackend('metadata_sync', {
                data: { entity: 'unknown_thing', action: 'create', data: { slug: 'test' } },
            }, ctx, deps);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('unsupported entity'),
            );

            warnSpy.mockRestore();
        });

        it('should warn when action is missing', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await routeEventToBackend('metadata_sync', {
                data: { entity: 'agent', data: { slug: 'test' } },
            }, ctx, deps);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('missing entity'),
            );

            warnSpy.mockRestore();
        });

        it('should warn when slug is missing from agent data', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await routeEventToBackend('metadata_sync', {
                data: { entity: 'agent', action: 'create', data: { name: 'test' } },
            }, ctx, deps);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('missing slug'),
            );

            warnSpy.mockRestore();
        });

        it('should warn for unknown actions', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await routeEventToBackend('metadata_sync', {
                entity: 'agent',
                action: 'purge',
                data: { slug: 'test-agent' },
            }, ctx, deps);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining("unknown action 'purge'"),
            );

            warnSpy.mockRestore();
        });
    });

    // --- Category C: Structured log handlers ---

    describe('Category C (structured logging)', () => {
        // Only events that are pure logEvent calls in the router.
        // agent_output, session_started, trigger_indexing, push_notification,
        // delegation_record have specialized handlers and are tested separately.
        const logOnlyEvents = [
            'session_analytics',
            'health', 'sessions', 'credit_check',
            'heartbeat_fired', 'heartbeat_skipped',
            'ace_reflection', 'skill_suggestion',
            'scaffold_complete',
        ];

        for (const event of logOnlyEvents) {
            it(`should log ${event} events`, async () => {
                const ctx = createTestContext();
                const { deps, db } = createTestDeps();
                const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

                await routeEventToBackend(event, {
                    data: { agent_slug: 'test-agent', some_field: 'value' },
                }, ctx, deps);

                expect(db.queries).toHaveLength(0);
                expect(logSpy).toHaveBeenCalledWith(
                    expect.stringContaining(EVENT_ROUTER_LOG_PREFIX),
                );

                logSpy.mockRestore();
            });
        }
    });

    describe('error event', () => {
        it('should log with console.error including code and message', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();
            const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            await routeEventToBackend('error', {
                data: { code: 'TIMEOUT', message: 'Execution timed out' },
            }, ctx, deps);

            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('TIMEOUT'),
            );
            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Execution timed out'),
            );

            errorSpy.mockRestore();
        });

        it('should handle missing code and message', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();
            const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            await routeEventToBackend('error', { data: {} }, ctx, deps);

            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('unknown'),
            );

            errorSpy.mockRestore();
        });
    });

    // --- Default (unknown events) ---

    describe('unknown events', () => {
        it('should warn for unknown event types', async () => {
            const ctx = createTestContext();
            const { deps } = createTestDeps();
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await routeEventToBackend('completely_unknown_event', {}, ctx, deps);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('unknown event: completely_unknown_event'),
            );

            warnSpy.mockRestore();
        });
    });
});
