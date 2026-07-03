// In-memory implementations and helpers for runner-event-router tests

import type { PipelineContext, ResolvedExecutionDeps, AgentRow, ExecutionDatabase } from '../execution-pipeline.types';
import type { StreamEventType } from '../types';
import {
    CreditTracker,
    type CreditService,
    type UsageStore,
    type ToolUsageRecord,
    type SessionUsage,
} from '../../credits/credit-tracker.service';

export class InMemoryDatabase implements ExecutionDatabase {
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

export class FakeStream {
    public sentEvents: Array<{ type: string; content: unknown; meta: unknown }> = [];

    send(type: StreamEventType, content: unknown, meta?: unknown): void {
        this.sentEvents.push({ type, content, meta });
    }

    isClosed(): boolean {
        return false;
    }
}

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

export function createTestContext(overrides?: Partial<PipelineContext>): PipelineContext {
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

export interface TestDeps {
    deps: ResolvedExecutionDeps;
    db: InMemoryDatabase;
    creditService: InMemoryCreditService;
    creditTracker: CreditTracker;
}

export function createTestDeps(db?: InMemoryDatabase): TestDeps {
    const inMemoryDb = db || new InMemoryDatabase();
    const creditService = new InMemoryCreditService();
    const usageStore = new InMemoryUsageStore();
    const creditTracker = new CreditTracker({ creditService, usageStore });

    const deps: ResolvedExecutionDeps = {
        db: inMemoryDb,
        creditTracker,
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

export function getStream(ctx: PipelineContext): FakeStream {
    return ctx.stream as unknown as FakeStream;
}
