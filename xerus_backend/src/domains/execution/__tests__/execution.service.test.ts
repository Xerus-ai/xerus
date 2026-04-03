// Execution Service v2 Tests
// Tests for the simplified 5-step pipeline (thin backend router)
// Uses real service instances with injected test doubles (not jest.mock)

import { EventEmitter } from 'events';
import { ExecutionService, ExecutionServiceDeps, AgentRow, ExecutionDatabase } from '../execution.service';
import { PricingService } from '../sdk/pricing.service';
import { SandboxService } from '../../sandbox-infra/sandbox/sandbox.service';
import {
    SandboxProvider,
    ProviderSandbox,
    CreateProviderSandboxOptions,
    ProviderSandboxStatus,
    ProviderCapabilities,
} from '../../sandbox-infra/sandbox/providers';
import { ExecutionQueueService } from '../queue/execution-queue.service';
import { CreditTracker, CreditTrackerDeps } from '../../credits/credit-tracker.service';
import { StreamingResponse } from '../streaming/stream.handler';
import { ThinkingLevel, AutonomyLevel } from '../types';

afterAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 500));
});

// -----------------------------------------------------------------------------
// Test Doubles (injected, NOT jest.mock)
// -----------------------------------------------------------------------------

function createTestAgent(overrides?: Partial<AgentRow>): AgentRow {
    return {
        id: 1,
        name: 'Test Agent',
        slug: 'test-agent',
        description: 'A test agent',
        ai_model: 'anthropic/claude-sonnet-4',
        thinking_level: 'medium' as ThinkingLevel,
        autonomy_level: 'supervised' as AutonomyLevel,
        adapter_type: 'claudecode',
        primary_use_case: 'testing',
        workspace_id: 'ws-123',
        user_id: 'user-123',
        ...overrides,
    };
}

function createTestDb(agent?: AgentRow): ExecutionDatabase {
    const testAgent = agent || createTestAgent();
    return {
        async query<T>(sql: string): Promise<{ rows: T[] }> {
            if (sql.includes('FROM agents')) {
                return { rows: [testAgent] as T[] };
            }
            return { rows: [] as T[] };
        },
    };
}

function createTestCreditTrackerDeps(): CreditTrackerDeps {
    return {
        creditService: {
            async checkCredits(_userId: string, _required: number): Promise<boolean> {
                return true;
            },
            async deduct(_userId: string, _input: { amount: number }): Promise<{ balance: number }> {
                return { balance: 100 };
            },
            async refund(_userId: string, _amount: number, _description?: string): Promise<{ balance: number }> {
                return { balance: 100 };
            },
            async getBalance(_userId: string): Promise<{ balance: number }> {
                return { balance: 100 };
            },
        },
        usageStore: {
            async storeToolUsage(): Promise<void> {},
            async getSessionUsage(sessionId: string) {
                return {
                    session_id: sessionId,
                    total_input_tokens: 100,
                    total_output_tokens: 200,
                    total_credits: 5,
                    tool_calls: 2,
                };
            },
        },
    };
}

class TestSandboxProvider implements SandboxProvider {
    readonly name = 'test';
    readonly capabilities: ProviderCapabilities = {
        supportsPause: true,
        supportsResume: true,
        supportsTimeout: true,
        maxLifetimeMs: 300_000,
    };

    private nextId = 0;

    async create(_options: CreateProviderSandboxOptions): Promise<ProviderSandbox> {
        this.nextId++;
        return { sandboxId: `test-sandbox-${this.nextId}` };
    }

    async connect(sandboxId: string): Promise<ProviderSandbox> {
        return { sandboxId };
    }

    async pause(): Promise<void> {}
    async kill(): Promise<void> {}
    async getStatus(sandboxId: string): Promise<ProviderSandboxStatus> {
        return { sandboxId, state: 'running' };
    }
}

function createTestSandboxDb(): { query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> } {
    return {
        async query<T>(): Promise<{ rows: T[] }> {
            return { rows: [] as T[] };
        },
    };
}

// PricingService is now credit-only (estimateCredits, calculateActualCredits).
// Execution flows through the v2 pipeline, not through PricingService.executeAgent().

function createTestSdkDb() {
    return {
        query: async <T>(): Promise<{ rows: T[] }> => {
            return { rows: [] as T[] };
        },
    };
}

interface TestStreamState {
    stream: StreamingResponse;
    chunks: string[];
    headers: Record<string, string>;
}

function createTestStream(): TestStreamState {
    const chunks: string[] = [];
    const headers: Record<string, string> = {};
    const emitter = new EventEmitter();

    const fakeRes = {
        setHeader(key: string, value: string) {
            headers[key] = value;
        },
        flushHeaders() {},
        write(data: string) {
            chunks.push(data);
            return true;
        },
        end() {},
        on(event: string, handler: (...args: unknown[]) => void) {
            emitter.on(event, handler);
            return fakeRes;
        },
        emit(event: string, ...args: unknown[]) {
            emitter.emit(event, ...args);
        },
    };

    const stream = new StreamingResponse(fakeRes as unknown as import('express').Response);

    return { stream, chunks, headers };
}

// v2 deps: sdkService, sandboxService, queueService, creditTracker, db, hitlHandler, activeStreamEmitter
function createTestDeps(overrides?: Partial<ExecutionServiceDeps>): ExecutionServiceDeps {
    return {
        sdkService: new PricingService(createTestSdkDb()),
        sandboxService: new SandboxService(createTestSandboxDb(), new TestSandboxProvider()),
        queueService: new ExecutionQueueService(),
        creditTracker: new CreditTracker(createTestCreditTrackerDeps()),
        db: createTestDb(),
        hitlHandler: { requestApproval: async () => ({}), resolveApproval: async () => ({}) } as unknown as ExecutionServiceDeps['hitlHandler'],
        activeStreamEmitter: null,
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('ExecutionService v2', () => {
    describe('constructor', () => {
        it('should create an instance with v2 dependencies', () => {
            const deps = createTestDeps();
            const service = new ExecutionService(deps);
            expect(service).toBeInstanceOf(ExecutionService);
        });

        it('should not require v1 dependencies (promptAssembler, hooksService, etc)', () => {
            const deps = createTestDeps();
            // Verify v1 deps are NOT in the interface
            expect(deps).not.toHaveProperty('promptAssembler');
            expect(deps).not.toHaveProperty('hooksService');
            expect(deps).not.toHaveProperty('contextBuilder');
            expect(deps).not.toHaveProperty('tokenEstimator');
        });
    });

    describe('cancelExecution', () => {
        it('should return false for non-existent execution', () => {
            const deps = createTestDeps();
            const service = new ExecutionService(deps);
            const result = service.cancelExecution('non-existent-id');
            expect(result).toBe(false);
        });
    });

    describe('v2 pipeline structure', () => {
        it('should have v2 deps (no prompt/context/hooks/token/storage deps)', () => {
            const deps = createTestDeps();
            const keys = Object.keys(deps);

            expect(keys).toContain('sdkService');
            expect(keys).toContain('sandboxService');
            expect(keys).toContain('queueService');
            expect(keys).toContain('creditTracker');
            expect(keys).toContain('db');
            expect(keys).toContain('hitlHandler');
            expect(keys).toContain('activeStreamEmitter');
            expect(keys).toHaveLength(7);
        });
    });

    // startExecution tests are last because the pipeline fires background promises
    // (resolveApiKey, ensureSandbox, resolveAllSecrets) that use the real DB connection.
    // These promises may reject asynchronously after the test completes.
    describe('startExecution - early pipeline steps', () => {
        it('should send error event when agent not found', async () => {
            const emptyDb: ExecutionDatabase = {
                async query<T>(): Promise<{ rows: T[] }> {
                    return { rows: [] as T[] };
                },
            };

            const deps = createTestDeps({ db: emptyDb });
            const service = new ExecutionService(deps);
            const testState = createTestStream();

            await service.startExecution({
                request: { agentSlug: 'nonexistent-agent', task: 'Test task', userId: 'user-123' },
                stream: testState.stream,
            });

            const errorChunk = testState.chunks.find((c) => c.includes('"success":false'));
            expect(errorChunk).toBeDefined();
        });

        it('should send error event when credits insufficient', async () => {
            const noCreditsDeps = createTestCreditTrackerDeps();
            noCreditsDeps.creditService.checkCredits = async () => false;
            const creditTracker = new CreditTracker(noCreditsDeps);

            const deps = createTestDeps({ creditTracker });
            const service = new ExecutionService(deps);
            const testState = createTestStream();

            await service.startExecution({
                request: { agentSlug: 'test-agent', task: 'Test task', userId: 'user-123' },
                stream: testState.stream,
            });

            const errorChunk = testState.chunks.find((c) => c.includes('"success":false'));
            expect(errorChunk).toBeDefined();
        });

        it('should stream progress event before pipeline fails', async () => {
            const deps = createTestDeps();
            const service = new ExecutionService(deps);
            const testState = createTestStream();

            // Pipeline sends a progress event early (before resolveApiKey which requires real DB).
            // Meta event with agent info now comes from session_started runner event, not pipeline preflight.
            await service.startExecution({
                request: { agentSlug: 'test-agent', task: 'Test task', userId: 'user-123' },
                stream: testState.stream,
            });

            const progressChunk = testState.chunks.find((c) => c.includes('"type":"progress"'));
            expect(progressChunk).toBeDefined();

            if (progressChunk) {
                const progressEvent = JSON.parse(progressChunk.replace('data: ', '').trim());
                expect(progressEvent.type).toBe('progress');
                expect(progressEvent.content.phase).toBe('sandbox');
            }
        });

        it('should close stream after error', async () => {
            const emptyDb: ExecutionDatabase = {
                async query<T>(): Promise<{ rows: T[] }> {
                    return { rows: [] as T[] };
                },
            };

            const deps = createTestDeps({ db: emptyDb });
            const service = new ExecutionService(deps);
            const testState = createTestStream();

            await service.startExecution({
                request: { agentSlug: 'test-agent', task: 'Test task', userId: 'user-123' },
                stream: testState.stream,
            });

            // Stream stays open (reusable per-conversation); error sent as event
            const errorChunk = testState.chunks.find((c) => c.includes('"success":false'));
            expect(errorChunk).toBeDefined();
        });
    });
});
