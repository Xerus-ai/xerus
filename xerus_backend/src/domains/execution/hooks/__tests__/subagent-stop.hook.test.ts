// SubagentStop Hook Tests
// Tests for delegation tracking when subagents complete



import {
    SubagentStopHandler,
    SubagentStopHandlerDeps,
    SubagentStopContext,
    DelegationRecord,
    SubagentStopHandlerResult,
    createSubagentStopHandler,
} from '../subagent-stop.hook';
import { SubagentStopInput } from '../hooks.types';
import { StreamEvent } from '../../types';

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function createTestInput(overrides: Partial<SubagentStopInput> = {}): SubagentStopInput {
    return {
        session_id: 'session-123',
        transcript_path: '/workspace/transcript.jsonl',
        cwd: '/workspace',
        subagent_type: 'researcher',
        result: { summary: 'Found 3 relevant articles' },
        duration_ms: 5000,
        success: true,
        tokens_used: 1500,
        ...overrides,
    };
}

function createTestContext(overrides: Partial<SubagentStopContext> = {}): SubagentStopContext {
    return {
        agent_id: 123,
        agent_slug: 'lead-agent',
        user_id: 'user-456',
        execution_id: 'exec-789',
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// In-Memory Test Dependencies
// -----------------------------------------------------------------------------

class InMemoryDelegationTracker {
    public records: DelegationRecord[] = [];
    public shouldFail = false;

    async record(delegation: DelegationRecord): Promise<void> {
        if (this.shouldFail) {
            throw new Error('Delegation tracking failed');
        }
        this.records.push(delegation);
    }

    clear(): void {
        this.records = [];
        this.shouldFail = false;
    }
}

class InMemoryCreditTracker {
    public delegations: Array<{
        userId: string;
        subagentType: string;
        tokensUsed: number;
    }> = [];
    public shouldFail = false;

    async recordDelegation(
        userId: string,
        subagentType: string,
        tokensUsed: number,
    ): Promise<void> {
        if (this.shouldFail) {
            throw new Error('Credit tracking failed');
        }
        this.delegations.push({ userId, subagentType, tokensUsed });
    }

    clear(): void {
        this.delegations = [];
        this.shouldFail = false;
    }
}

class InMemoryNotificationService {
    public failures: Array<{
        parent_agent_id: number;
        subagent_type: string;
        error?: string;
    }> = [];
    public shouldFail = false;

    async notifyAgentFailure(params: {
        parent_agent_id: number;
        subagent_type: string;
        error?: string;
    }): Promise<void> {
        if (this.shouldFail) {
            throw new Error('Notification service failed');
        }
        this.failures.push(params);
    }

    clear(): void {
        this.failures = [];
        this.shouldFail = false;
    }
}

class InMemorySSEEmitter {
    public events: StreamEvent[] = [];

    emit(event: StreamEvent): void {
        this.events.push(event);
    }

    getLastEvent(): StreamEvent | undefined {
        return this.events[this.events.length - 1];
    }

    clear(): void {
        this.events = [];
    }
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('SubagentStopHandler', () => {
    let handler: SubagentStopHandler;
    let delegationTracker: InMemoryDelegationTracker;
    let creditTracker: InMemoryCreditTracker;
    let notificationService: InMemoryNotificationService;
    let sseEmitter: InMemorySSEEmitter;
    let context: SubagentStopContext;

    beforeEach(() => {
        delegationTracker = new InMemoryDelegationTracker();
        creditTracker = new InMemoryCreditTracker();
        notificationService = new InMemoryNotificationService();
        sseEmitter = new InMemorySSEEmitter();
        context = createTestContext();

        const deps: SubagentStopHandlerDeps = {
            delegationTracker,
            creditTracker,
            notificationService,
            sseEmitter,
        };

        handler = new SubagentStopHandler(deps, context);
    });

    afterEach(() => {
        delegationTracker.clear();
        creditTracker.clear();
        notificationService.clear();
        sseEmitter.clear();
    });

    describe('handle - successful subagent', () => {
        it('should return success for completed subagent', async () => {
            const input = createTestInput();

            const result = await handler.handle(input);

            expect(result.success).toBe(true);
        });

        it('should track delegation in analytics', async () => {
            const input = createTestInput({
                subagent_type: 'code-reviewer',
                duration_ms: 12000,
                success: true,
            });

            await handler.handle(input);

            expect(delegationTracker.records).toHaveLength(1);
            expect(delegationTracker.records[0]).toMatchObject({
                parent_agent_id: 123,
                subagent_type: 'code-reviewer',
                success: true,
                duration_ms: 12000,
            });
            expect(delegationTracker.records[0].timestamp).toBeInstanceOf(Date);
        });

        it('should record credit usage for subagent tokens', async () => {
            const input = createTestInput({
                subagent_type: 'writer',
                tokens_used: 2500,
            });

            await handler.handle(input);

            expect(creditTracker.delegations).toHaveLength(1);
            expect(creditTracker.delegations[0]).toEqual({
                userId: 'user-456',
                subagentType: 'writer',
                tokensUsed: 2500,
            });
        });

        it('should NOT notify on successful subagent', async () => {
            const input = createTestInput({ success: true });

            await handler.handle(input);

            expect(notificationService.failures).toHaveLength(0);
        });

        it('should emit SSE event for subagent completion', async () => {
            const input = createTestInput({
                subagent_type: 'analyzer',
                duration_ms: 8000,
                success: true,
            });

            await handler.handle(input);

            expect(sseEmitter.events).toHaveLength(1);
            const event = sseEmitter.getLastEvent();
            expect(event?.type).toBe('progress');
            expect(event?.execution_id).toBe('exec-789');
        });
    });

    describe('handle - failed subagent', () => {
        it('should track delegation for failed subagent', async () => {
            const input = createTestInput({
                success: false,
                error: 'Tool timeout',
            });

            await handler.handle(input);

            expect(delegationTracker.records).toHaveLength(1);
            expect(delegationTracker.records[0].success).toBe(false);
        });

        it('should notify on subagent failure', async () => {
            const input = createTestInput({
                subagent_type: 'deployer',
                success: false,
                error: 'Deployment failed: container crash',
            });

            await handler.handle(input);

            expect(notificationService.failures).toHaveLength(1);
            expect(notificationService.failures[0]).toEqual({
                parent_agent_id: 123,
                subagent_type: 'deployer',
                error: 'Deployment failed: container crash',
            });
        });

        it('should still record credits for failed subagent', async () => {
            const input = createTestInput({
                success: false,
                tokens_used: 800,
                subagent_type: 'tester',
            });

            await handler.handle(input);

            expect(creditTracker.delegations).toHaveLength(1);
            expect(creditTracker.delegations[0].tokensUsed).toBe(800);
        });

        it('should emit SSE event for failed subagent', async () => {
            const input = createTestInput({
                success: false,
                error: 'Context overflow',
            });

            await handler.handle(input);

            expect(sseEmitter.events).toHaveLength(1);
            const event = sseEmitter.getLastEvent();
            expect(event?.type).toBe('progress');
        });
    });

    describe('credit tracking', () => {
        it('should skip credit tracking when tokens_used is undefined', async () => {
            const input = createTestInput();
            delete (input as { tokens_used?: number }).tokens_used;

            await handler.handle(input);

            expect(creditTracker.delegations).toHaveLength(0);
        });

        it('should track zero tokens', async () => {
            const input = createTestInput({ tokens_used: 0 });

            await handler.handle(input);

            expect(creditTracker.delegations).toHaveLength(1);
            expect(creditTracker.delegations[0].tokensUsed).toBe(0);
        });
    });

    describe('SSE event content', () => {
        it('should include subagent details in event content', async () => {
            const input = createTestInput({
                subagent_type: 'researcher',
                success: true,
                duration_ms: 3000,
            });

            await handler.handle(input);

            const event = sseEmitter.getLastEvent();
            expect(event?.content).toMatchObject({
                phase: 'subagent_completed',
                message: expect.stringContaining('researcher'),
            });
        });

        it('should indicate failure in event content', async () => {
            const input = createTestInput({
                subagent_type: 'builder',
                success: false,
                error: 'Build error',
            });

            await handler.handle(input);

            const event = sseEmitter.getLastEvent();
            expect(event?.content).toMatchObject({
                phase: 'subagent_completed',
                message: expect.stringContaining('failed'),
            });
        });

        it('should include timestamp in event', async () => {
            const input = createTestInput();

            await handler.handle(input);

            const event = sseEmitter.getLastEvent();
            expect(event?.timestamp).toBeDefined();
            expect(() => new Date(event!.timestamp!)).not.toThrow();
        });
    });

    describe('result details', () => {
        it('should include subagent_type in result', async () => {
            const input = createTestInput({ subagent_type: 'code-review' });

            const result = await handler.handle(input) as SubagentStopHandlerResult;

            expect(result.subagent_type).toBe('code-review');
        });

        it('should include duration_ms in result', async () => {
            const input = createTestInput({ duration_ms: 15000 });

            const result = await handler.handle(input) as SubagentStopHandlerResult;

            expect(result.duration_ms).toBe(15000);
        });

        it('should include subagent_success in result', async () => {
            const successInput = createTestInput({ success: true });
            const failInput = createTestInput({ success: false });

            const successResult = await handler.handle(successInput) as SubagentStopHandlerResult;
            const failResult = await handler.handle(failInput) as SubagentStopHandlerResult;

            expect(successResult.subagent_success).toBe(true);
            expect(failResult.subagent_success).toBe(false);
        });
    });

    describe('error handling - fail-fast', () => {
        it('should throw when delegation tracking fails', async () => {
            delegationTracker.shouldFail = true;
            const input = createTestInput();

            await expect(handler.handle(input)).rejects.toThrow('Delegation tracking failed');
        });

        it('should throw when credit tracking fails', async () => {
            creditTracker.shouldFail = true;
            const input = createTestInput({ tokens_used: 100 });

            await expect(handler.handle(input)).rejects.toThrow('Credit tracking failed');
        });

        it('should throw when notification service fails', async () => {
            notificationService.shouldFail = true;
            const input = createTestInput({ success: false, error: 'some error' });

            await expect(handler.handle(input)).rejects.toThrow('Notification service failed');
        });
    });

    describe('factory function', () => {
        it('should create a handler function', () => {
            const deps: SubagentStopHandlerDeps = {
                delegationTracker,
                creditTracker,
                notificationService,
                sseEmitter,
            };

            const handlerFn = createSubagentStopHandler(deps, context);

            expect(typeof handlerFn).toBe('function');
        });

        it('should work as a hook handler', async () => {
            const deps: SubagentStopHandlerDeps = {
                delegationTracker,
                creditTracker,
                notificationService,
                sseEmitter,
            };

            const handlerFn = createSubagentStopHandler(deps, context);
            const input = createTestInput();

            const result = await handlerFn(input);

            expect(result.success).toBe(true);
            expect(delegationTracker.records).toHaveLength(1);
        });
    });

    describe('direct instantiation', () => {
        it('should create handler with correct types', () => {
            const deps: SubagentStopHandlerDeps = {
                delegationTracker,
                creditTracker,
                notificationService,
                sseEmitter,
            };
            const stopHandler = new SubagentStopHandler(deps, context);

            expect(stopHandler).toBeInstanceOf(SubagentStopHandler);
        });
    });
});
