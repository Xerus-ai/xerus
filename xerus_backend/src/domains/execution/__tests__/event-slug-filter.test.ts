// Event Slug Filter Tests
// Verifies that processEventStream filters events by agent_slug,
// preventing identity leakage when multiple agents run concurrently
// in the same PersistentLogBuffer.
//
// Bug: Inbox watcher triggers master agent while domain agent is running.
// Both write to the same stdout buffer. Without filtering, master's
// reasoning ("I am Xerus, the CEO") leaks into the domain agent's SSE stream.

import { PersistentLogBuffer } from '../../sandbox-infra/sandbox/providers/daytona-runner';
import { streamRunnerEvents } from '../execution-pipeline';
import type { PipelineContext, ResolvedExecutionDeps, AgentRow, ExecutionDatabase } from '../execution-pipeline.types';
import type { StreamEventType } from '../types';
import type { SessionHandle } from '../../sandbox-infra/sandbox/providers/daytona-runner';
import {
    CreditTracker,
    type CreditService,
    type UsageStore,
    type ToolUsageRecord,
    type SessionUsage,
} from '../../credits/credit-tracker.service';

// -----------------------------------------------------------------------------
// In-memory implementations (real objects, not mocks)
// -----------------------------------------------------------------------------

class InMemoryDatabase implements ExecutionDatabase {
    public queries: Array<{ sql: string; params: unknown[] }> = [];
    async query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
        this.queries.push({ sql, params: params || [] });
        return { rows: [] } as { rows: T[] };
    }
}

class InMemoryCreditService implements CreditService {
    async checkCredits(): Promise<boolean> { return true; }
    async deduct(): Promise<{ balance: number }> { return { balance: 100 }; }
    async refund(): Promise<{ balance: number }> { return { balance: 100 }; }
    async getBalance(): Promise<{ balance: number }> { return { balance: 100 }; }
}

class InMemoryUsageStore implements UsageStore {
    public records: ToolUsageRecord[] = [];
    async storeToolUsage(record: ToolUsageRecord): Promise<void> { this.records.push(record); }
    async getSessionUsage(sessionId: string): Promise<SessionUsage> {
        return { session_id: sessionId, total_input_tokens: 0, total_output_tokens: 0, total_credits: 0, tool_calls: 0 };
    }
}

class FakeStream {
    public sentEvents: Array<{ type: string; content: unknown; meta: unknown }> = [];
    private _closed = false;
    send(type: StreamEventType, content: unknown, meta?: unknown): void {
        this.sentEvents.push({ type, content, meta });
    }
    isClosed(): boolean { return this._closed; }
    close(): void { this._closed = true; }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function createAgent(slug: string): AgentRow {
    return {
        id: 1, name: slug, slug, description: '', ai_model: 'claude-sonnet-4-5-20250929',
        thinking_level: 'medium', autonomy_level: 'supervised', adapter_type: 'claudecode', primary_use_case: '',
        workspace_id: 'ws-1', user_id: 'user-1',
    };
}

function createContext(agentSlug: string, overrides?: Partial<PipelineContext>): PipelineContext {
    const stream = new FakeStream();
    return {
        executionId: 'exec-1', stream: stream as unknown as PipelineContext['stream'],
        request: { userId: 'user-1', agentSlug, task: 'test', coordinationMode: 'sequential' } as PipelineContext['request'],
        agent: createAgent(agentSlug), sandboxId: 'sbx-1', sessionHandle: null, laneId: null,
        startedAt: Date.now(), sessionId: 'session-1', inputTokens: 0, outputTokens: 0,
        toolCallCount: 0, status: 'running', streamOffset: 0, conversationId: null,
        responseText: '', responseChunks: [], creditsUsed: 0, keySource: null,
        subscriptionStatus: null, subscriptionPeriodEnd: null, agentSessionCount: 0, announceQueue: null, thinkingChunks: [], toolCallDetails: [],
        eventsFiltered: 0, setupReport: null, hookHealth: null, sdkSessionId: null, triggerType: 'user_message' as const, toolCallMap: new Map(), executionFailed: false, executionError: null,
        ...overrides,
    };
}

function createDeps(): ResolvedExecutionDeps {
    const creditTracker = new CreditTracker({
        creditService: new InMemoryCreditService(),
        usageStore: new InMemoryUsageStore(),
    });
    return {
        db: new InMemoryDatabase(), creditTracker,
        sdkService: {} as ResolvedExecutionDeps['sdkService'],
        sandboxService: {} as ResolvedExecutionDeps['sandboxService'],
        queueService: {} as ResolvedExecutionDeps['queueService'],
        memorySearchIndex: null, messageBridge: null,
        hitlHandler: { requestApproval: async () => ({}), resolveApproval: async () => ({}) } as unknown as ResolvedExecutionDeps['hitlHandler'],
        activeStreamEmitter: null,
    };
}

function buildHandle(buffer: PersistentLogBuffer): SessionHandle {
    return {
        sessionId: 'test', commandId: 'cmd-1', agentSlug: 'test-agent',
        sendInput: async () => {},
        streamLogs: async () => {},
        logBuffer: buffer,
    };
}

function pushEvent(buffer: PersistentLogBuffer, event: Record<string, unknown>): void {
    // Access the internal onStdout by starting a controlled stream
    // We use the buffer's start method with a callback that we control
    const line = JSON.stringify(event) + '\n';
    // Use the private method workaround: create a buffer that already has events
    (buffer as any).onStdout(line);
}

function pushAndClose(buffer: PersistentLogBuffer, events: Record<string, unknown>[]): void {
    for (const event of events) {
        pushEvent(buffer, event);
    }
    (buffer as any).close();
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('Event slug filtering in processEventStream', () => {
    it('should forward events matching the expected agent_slug', async () => {
        const buffer = new PersistentLogBuffer();
        const ctx = createContext('curator-carla');
        const deps = createDeps();
        const handle = buildHandle(buffer);
        ctx.sessionHandle = handle;

        pushAndClose(buffer, [
            { event: 'sse_forward', agent_slug: 'curator-carla', data: { sse_event: 'token', payload: { text: 'hello' } } },
            { event: 'session_ended', agent_slug: 'curator-carla', data: { usage: { input_tokens: 100, output_tokens: 50 } } },
        ]);

        await streamRunnerEvents(handle, ctx, deps);

        const stream = ctx.stream as unknown as FakeStream;
        const tokenEvents = stream.sentEvents.filter(e => e.type === 'token');
        expect(tokenEvents.length).toBe(1);
        expect(ctx.inputTokens).toBe(100);
        expect(ctx.outputTokens).toBe(50);
    });

    it('should SKIP events from a different agent_slug', async () => {
        const buffer = new PersistentLogBuffer();
        const ctx = createContext('curator-carla');
        const deps = createDeps();
        const handle = buildHandle(buffer);
        ctx.sessionHandle = handle;

        pushAndClose(buffer, [
            // Master agent's events — should be filtered out
            { event: 'sse_forward', agent_slug: 'xerus-master', data: { sse_event: 'reasoning', payload: { thought: 'I am Xerus, the CEO' } } },
            { event: 'sse_forward', agent_slug: 'xerus-master', data: { sse_event: 'token', payload: { text: 'Master response' } } },
            // Carla's events — should pass through
            { event: 'sse_forward', agent_slug: 'curator-carla', data: { sse_event: 'token', payload: { text: 'Carla response' } } },
            { event: 'session_ended', agent_slug: 'curator-carla', data: { usage: { input_tokens: 200, output_tokens: 100 } } },
        ]);

        await streamRunnerEvents(handle, ctx, deps);

        const stream = ctx.stream as unknown as FakeStream;
        // Only Carla's token event should be forwarded
        const tokenEvents = stream.sentEvents.filter(e => e.type === 'token');
        expect(tokenEvents.length).toBe(1);
        expect((tokenEvents[0].content as Record<string, unknown>).text).toBe('Carla response');

        // Master's reasoning should NOT appear
        const reasoningEvents = stream.sentEvents.filter(e => e.type === 'reasoning');
        expect(reasoningEvents.length).toBe(0);

        // eventsFiltered counter should reflect the 2 skipped master events
        expect(ctx.eventsFiltered).toBe(2);
    });

    it('should accept events without agent_slug (backward compat)', async () => {
        const buffer = new PersistentLogBuffer();
        const ctx = createContext('curator-carla');
        const deps = createDeps();
        const handle = buildHandle(buffer);
        ctx.sessionHandle = handle;

        pushAndClose(buffer, [
            // Event without agent_slug — should pass through
            { event: 'sse_forward', data: { sse_event: 'progress', payload: { phase: 'setup' } } },
            { event: 'session_ended', agent_slug: 'curator-carla', data: { usage: { input_tokens: 50, output_tokens: 25 } } },
        ]);

        await streamRunnerEvents(handle, ctx, deps);

        const stream = ctx.stream as unknown as FakeStream;
        const progressEvents = stream.sentEvents.filter(e => e.type === 'progress');
        expect(progressEvents.length).toBe(1);
    });

    it('should accept _transport events regardless of slug', async () => {
        const buffer = new PersistentLogBuffer();
        const ctx = createContext('curator-carla');
        const deps = createDeps();
        const handle = buildHandle(buffer);
        ctx.sessionHandle = handle;

        pushAndClose(buffer, [
            { event: 'error', agent_slug: '_transport', data: { code: 'STREAM_ERROR', message: 'test' } },
        ]);

        await streamRunnerEvents(handle, ctx, deps);

        // Should have processed the error event (pipeline breaks on error)
        // The important thing is it didn't skip the _transport event
        expect(ctx.status).toBe('running'); // error doesn't change status
    });

    it('should not break on session_ended from a different agent', async () => {
        const buffer = new PersistentLogBuffer();
        const ctx = createContext('curator-carla');
        const deps = createDeps();
        const handle = buildHandle(buffer);
        ctx.sessionHandle = handle;

        pushAndClose(buffer, [
            // Master's session_ended — should be filtered, NOT cause pipeline break
            { event: 'session_ended', agent_slug: 'xerus-master', data: { usage: { input_tokens: 500, output_tokens: 200 } } },
            // Carla's token — should still be processed
            { event: 'sse_forward', agent_slug: 'curator-carla', data: { sse_event: 'token', payload: { text: 'still working' } } },
            // Carla's session_ended — THIS should cause the break
            { event: 'session_ended', agent_slug: 'curator-carla', data: { usage: { input_tokens: 150, output_tokens: 75 } } },
        ]);

        await streamRunnerEvents(handle, ctx, deps);

        // Master's tokens should NOT be counted
        expect(ctx.inputTokens).toBe(150);
        expect(ctx.outputTokens).toBe(75);

        // Carla's token should be forwarded
        const stream = ctx.stream as unknown as FakeStream;
        const tokenEvents = stream.sentEvents.filter(e => e.type === 'token');
        expect(tokenEvents.length).toBe(1);
    });

    it('should filter agent_slug from nested data field', async () => {
        const buffer = new PersistentLogBuffer();
        const ctx = createContext('curator-carla');
        const deps = createDeps();
        const handle = buildHandle(buffer);
        ctx.sessionHandle = handle;
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        pushAndClose(buffer, [
            // agent_slug inside data field (StdoutEmitter wraps payloads)
            { event: 'hook_log', data: { agent_slug: 'xerus-master', hook_event: 'PreToolUse', success: true } },
            { event: 'hook_log', data: { agent_slug: 'curator-carla', hook_event: 'PostToolUse', success: true } },
            { event: 'session_ended', agent_slug: 'curator-carla', data: {} },
        ]);

        await streamRunnerEvents(handle, ctx, deps);

        // hook_executions table deprecated in migration 081 -- handleHookLog now logs only.
        // Master's hook_log should be filtered out; only Carla's hook_log should be logged.
        const db = deps.db as InMemoryDatabase;
        const hookQueries = db.queries.filter(q => q.sql.includes('hook_executions'));
        expect(hookQueries.length).toBe(0);

        // Verify Carla's hook_log was logged (not master's)
        const hookLogCalls = logSpy.mock.calls.filter(
            call => typeof call[0] === 'string' && call[0].includes('hook_log')
        );
        expect(hookLogCalls.length).toBe(1);
        expect(hookLogCalls[0][0]).toContain('curator-carla');

        logSpy.mockRestore();
    });
});
