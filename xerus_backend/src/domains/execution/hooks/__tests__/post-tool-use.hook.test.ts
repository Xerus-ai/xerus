// PostToolUse Hook Tests
// Tests for context threshold monitoring after tool execution



import {
    PostToolUseHandler,
    PostToolUseHandlerDeps,
    PostToolUseContext,
} from '../post-tool-use.hook';
import { PostToolUseInput } from '../hooks.types';
import { ThresholdMonitor, ContextThresholdExceededError } from '../threshold-monitor';
import { StreamEvent } from '../../types';

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function createTestInput(overrides: Partial<PostToolUseInput> = {}): PostToolUseInput {
    return {
        session_id: 'test-session-123',
        transcript_path: '/workspace/transcript.jsonl',
        cwd: '/workspace',
        tool_name: 'Read',
        tool_input: { file_path: '/workspace/test.md' },
        tool_result: { content: 'file contents' },
        duration_ms: 150,
        success: true,
        tokens_used: 500,
        agent_id: 'agent-123',
        user_id: 'user-456',
        ...overrides,
    };
}

function createTestContext(overrides: Partial<PostToolUseContext> = {}): PostToolUseContext {
    return {
        execution_id: 'exec-789',
        max_tokens: 128000,
        current_tokens: 50000,
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// Mock Dependencies
// -----------------------------------------------------------------------------

class InMemorySSEEmitter {
    public emittedEvents: StreamEvent[] = [];

    emit(event: StreamEvent): void {
        this.emittedEvents.push(event);
    }

    getLastEvent(): StreamEvent | undefined {
        return this.emittedEvents[this.emittedEvents.length - 1];
    }

    clear(): void {
        this.emittedEvents = [];
    }
}

class InMemoryCreditTracker {
    public recordedUsage: Array<{ userId: string; toolName: string; tokensUsed: number }> = [];

    async recordToolUsage(userId: string, toolName: string, tokensUsed: number): Promise<void> {
        this.recordedUsage.push({ userId, toolName, tokensUsed });
    }

    clear(): void {
        this.recordedUsage = [];
    }
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('PostToolUseHandler', () => {
    let handler: PostToolUseHandler;
    let inMemorySSE: InMemorySSEEmitter;
    let inMemoryCreditTracker: InMemoryCreditTracker;
    let thresholdMonitor: ThresholdMonitor;
    let context: PostToolUseContext;

    beforeEach(() => {
        inMemorySSE = new InMemorySSEEmitter();
        inMemoryCreditTracker = new InMemoryCreditTracker();
        thresholdMonitor = new ThresholdMonitor();
        context = createTestContext();

        const deps: PostToolUseHandlerDeps = {
            sseEmitter: inMemorySSE,
            creditTracker: inMemoryCreditTracker,
        };

        handler = new PostToolUseHandler(deps, context, thresholdMonitor);
    });

    describe('handle', () => {
        it('should return success when below all thresholds', async () => {
            const input = createTestInput({ tokens_used: 1000 });
            context.current_tokens = 50000; // ~39% usage

            const result = await handler.handle(input);

            expect(result.success).toBe(true);
            expect(result.hook_specific_output).toBeUndefined();
        });

        it('should record credit usage when creditTracker provided', async () => {
            const input = createTestInput({
                user_id: 'user-credit-test',
                tool_name: 'Write',
                tokens_used: 2500,
            });

            await handler.handle(input);

            expect(inMemoryCreditTracker.recordedUsage).toHaveLength(1);
            expect(inMemoryCreditTracker.recordedUsage[0]).toEqual({
                userId: 'user-credit-test',
                toolName: 'Write',
                tokensUsed: 2500,
            });
        });

        it('should not fail when creditTracker is not provided', async () => {
            const deps: PostToolUseHandlerDeps = {
                sseEmitter: inMemorySSE,
                // No creditTracker
            };
            const handlerWithoutCredit = new PostToolUseHandler(deps, context, thresholdMonitor);
            const input = createTestInput();

            const result = await handlerWithoutCredit.handle(input);

            expect(result.success).toBe(true);
        });
    });

    describe('threshold monitoring', () => {
        it('should emit SSE warning at 60% threshold (monitor)', async () => {
            context.current_tokens = 76800; // 60% of 128000
            const input = createTestInput({ tokens_used: 100 });

            await handler.handle(input);

            expect(inMemorySSE.emittedEvents).toHaveLength(1);
            const event = inMemorySSE.getLastEvent();
            expect(event?.type).toBe('context_warning');
        });

        it('should return additional_context at 75% threshold (prepare)', async () => {
            context.current_tokens = 96000; // 75% of 128000
            const input = createTestInput({ tokens_used: 100 });

            const result = await handler.handle(input);

            expect(result.success).toBe(true);
            expect(result.hook_specific_output).toBeDefined();
            const output = result.hook_specific_output as { additional_context?: string };
            expect(output.additional_context).toContain('working.md');
        });

        it('should return compact suggestion at 85% threshold', async () => {
            context.current_tokens = 108800; // 85% of 128000
            const input = createTestInput({ tokens_used: 100 });

            const result = await handler.handle(input);

            expect(result.success).toBe(true);
            const output = result.hook_specific_output as { additional_context?: string };
            expect(output.additional_context).toContain('compact');
        });

        it('should return critical warning at 92% threshold', async () => {
            context.current_tokens = 117760; // 92% of 128000
            const input = createTestInput({ tokens_used: 100 });

            const result = await handler.handle(input);

            expect(result.success).toBe(true);
            const output = result.hook_specific_output as { additional_context?: string };
            expect(output.additional_context).toContain('Stop new work');
        });

        it('should throw ContextThresholdExceededError at 95% threshold', async () => {
            context.current_tokens = 121600; // 95% of 128000
            const input = createTestInput({ tokens_used: 100 });

            await expect(handler.handle(input)).rejects.toThrow(ContextThresholdExceededError);
        });

        it('should only fire each tier once per session (once_per_tier_reset_on_compaction)', async () => {
            context.current_tokens = 96000; // 75%
            const input = createTestInput({ tokens_used: 100 });

            // First call should fire
            const result1 = await handler.handle(input);
            expect(result1.hook_specific_output).toBeDefined();

            // Second call at same level should not fire
            const result2 = await handler.handle(input);
            expect(result2.hook_specific_output).toBeUndefined();
        });
    });

    describe('SSE event emission', () => {
        it('should emit context_warning event with correct structure', async () => {
            context.current_tokens = 108800; // 85%
            const input = createTestInput({ tokens_used: 100 });

            await handler.handle(input);

            expect(inMemorySSE.emittedEvents).toHaveLength(1);
            const event = inMemorySSE.getLastEvent();
            expect(event?.type).toBe('context_warning');
            expect(event?.execution_id).toBe('exec-789');
            expect(event?.content).toMatchObject({
                warningType: 'approaching_limit',
                currentUsage: expect.any(Number),
                maxBudget: 128000,
                percentUsed: 85,
            });
        });

        it('should emit at_limit warning type for critical threshold', async () => {
            context.current_tokens = 117760; // 92%
            const input = createTestInput({ tokens_used: 100 });

            await handler.handle(input);

            const event = inMemorySSE.getLastEvent();
            expect(event?.content).toMatchObject({
                warningType: 'at_limit',
            });
        });
    });

    describe('resetOnCompaction', () => {
        it('should allow re-firing tiers after compaction reset', async () => {
            context.current_tokens = 96000; // 75%
            const input = createTestInput({ tokens_used: 100 });

            // First call fires
            const result1 = await handler.handle(input);
            expect(result1.hook_specific_output).toBeDefined();

            // Second call doesn't fire
            const result2 = await handler.handle(input);
            expect(result2.hook_specific_output).toBeUndefined();

            // Reset on compaction
            handler.resetOnCompaction();

            // Context reduced after compaction
            context.current_tokens = 30000;

            // Increase again to 75%
            context.current_tokens = 96000;

            // Should fire again
            const result3 = await handler.handle(input);
            expect(result3.hook_specific_output).toBeDefined();
        });
    });

    describe('direct instantiation', () => {
        it('should create handler with correct types', () => {
            const deps: PostToolUseHandlerDeps = {
                sseEmitter: inMemorySSE,
            };
            const postToolUseHandler = new PostToolUseHandler(deps, context, thresholdMonitor);

            expect(postToolUseHandler).toBeInstanceOf(PostToolUseHandler);
        });

        it('should work as a hook handler', async () => {
            const deps: PostToolUseHandlerDeps = {
                sseEmitter: inMemorySSE,
            };
            const postToolUseHandler = new PostToolUseHandler(deps, context, thresholdMonitor);
            const input = createTestInput();

            const result = await postToolUseHandler.handle(input);

            expect(result.success).toBe(true);
        });
    });
});

describe('PostToolUseHandler threshold state tracking', () => {
    it('should track threshold state across calls', async () => {
        const inMemorySSE = new InMemorySSEEmitter();
        const context = createTestContext({ current_tokens: 96000 }); // 75%
        const deps: PostToolUseHandlerDeps = { sseEmitter: inMemorySSE };
        const monitor = new ThresholdMonitor();

        const postToolUseHandler = new PostToolUseHandler(deps, context, monitor);
        const input = createTestInput({ tokens_used: 100 });

        // First call fires threshold
        const result1 = await postToolUseHandler.handle(input);
        expect(result1.hook_specific_output).toBeDefined();

        // Second call doesn't fire (same threshold)
        const result2 = await postToolUseHandler.handle(input);
        expect(result2.hook_specific_output).toBeUndefined();
    });
});
