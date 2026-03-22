// PreCompact Hook Tests
// Tests for graduated context threshold steering and memory preservation before compaction

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '..', '.env') });

import {
    PreCompactHandler,
    PreCompactHandlerDeps,
    PreCompactContext,
    PreCompactHandlerResult,
    createPreCompactHandler,
} from '../pre-compact.hook';
import { PreCompactInput } from '../hooks.types';
import { StreamEvent } from '../../types';

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function createTestInput(overrides: Partial<PreCompactInput> = {}): PreCompactInput {
    return {
        session_id: 'test-session-123',
        transcript_path: '/workspace/transcript.jsonl',
        cwd: '/workspace',
        context_usage_percent: 85,
        current_todos: [
            { id: 1, status: 'in_progress', content: 'Implement feature' },
        ],
        key_decisions: ['Use Git-based memory', 'Skip caching for now'],
        open_issues: ['Need to handle edge case X'],
        working_memory_summary: 'Building the PreCompact hook implementation',
        ...overrides,
    };
}

function createTestContext(overrides: Partial<PreCompactContext> = {}): PreCompactContext {
    return {
        agent_id: 123,
        agent_slug: 'test-agent',
        user_id: 'user-456',
        workspace_id: 'workspace-001',
        execution_id: 'exec-789',
        compaction_count: 0,
        project_slug: undefined,
        channel_slug: undefined,
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// In-Memory Test Dependencies
// -----------------------------------------------------------------------------

class InMemoryMemoryExtractor {
    private defaultMemories = {
        working: 'Current task in progress',
        episodic: [{ event: 'Session compacted', outcome: 'state preserved', scope: 'agent' as const }],
        semantic: [] as Array<{ fact: string; confidence: number; scope: 'company' | 'project' | 'channel' | 'agent' }>,
        procedural: [] as Array<{ pattern: string; steps: string[]; scope: 'company' | 'project' | 'channel' | 'agent' }>,
        digest_line: 'Compaction save: working on implementation',
    };
    readonly extractCalls: Array<{ transcript: string; agentSlug: string }> = [];
    private shouldFail = false;
    private failureError: Error | null = null;

    setMemories(memories: typeof this.defaultMemories): void {
        this.defaultMemories = memories;
    }

    setFailure(error: Error): void {
        this.shouldFail = true;
        this.failureError = error;
    }

    async extract(transcript: string, agentSlug: string): Promise<typeof this.defaultMemories> {
        this.extractCalls.push({ transcript, agentSlug });
        if (this.shouldFail && this.failureError) {
            throw this.failureError;
        }
        return this.defaultMemories;
    }
}

class InMemoryGitMemoryService {
    readonly writeAndCommitCalls: Array<{
        workspaceId: string;
        agentSlug: string;
        memories: unknown;
        commitMessage: string;
        projectSlug?: string;
        channelSlug?: string;
    }> = [];
    readonly triggerIndexingCalls: Array<{ workspaceId: string; commitSha: string }> = [];
    private commitCounter = 0;
    private shouldFail = false;
    private failureError: Error | null = null;

    setFailure(error: Error): void {
        this.shouldFail = true;
        this.failureError = error;
    }

    async writeAndCommit(params: {
        workspaceId: string;
        agentSlug: string;
        memories: unknown;
        commitMessage: string;
        projectSlug?: string;
        channelSlug?: string;
    }): Promise<{ commitSha: string }> {
        this.writeAndCommitCalls.push(params);
        if (this.shouldFail && this.failureError) {
            throw this.failureError;
        }
        return { commitSha: `sha-${++this.commitCounter}` };
    }

    triggerIndexing(workspaceId: string, commitSha: string): void {
        this.triggerIndexingCalls.push({ workspaceId, commitSha });
    }
}

class InMemorySSEEmitter {
    public emittedEvents: StreamEvent[] = [];

    emit(event: StreamEvent): void {
        this.emittedEvents.push(event);
    }

    getLastEvent(): StreamEvent | undefined {
        return this.emittedEvents[this.emittedEvents.length - 1];
    }
}

function createTestDeps(): {
    deps: PreCompactHandlerDeps;
    memoryExtractor: InMemoryMemoryExtractor;
    gitMemoryService: InMemoryGitMemoryService;
    sseEmitter: InMemorySSEEmitter;
} {
    const memoryExtractor = new InMemoryMemoryExtractor();
    const gitMemoryService = new InMemoryGitMemoryService();
    const sseEmitter = new InMemorySSEEmitter();

    return {
        deps: {
            memoryExtractor,
            gitMemoryService,
            sseEmitter,
        },
        memoryExtractor,
        gitMemoryService,
        sseEmitter,
    };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('PreCompactHandler', () => {
    describe('constructor', () => {
        it('should create handler with required dependencies', () => {
            const { deps } = createTestDeps();
            const context = createTestContext();
            const handler = new PreCompactHandler(deps, context);

            expect(handler).toBeInstanceOf(PreCompactHandler);
        });
    });

    describe('handle', () => {
        it('should return successful result on normal execution', async () => {
            const { deps } = createTestDeps();
            const context = createTestContext();
            const handler = new PreCompactHandler(deps, context);

            const result = await handler.handle(createTestInput());

            expect(result.success).toBe(true);
        });

        it('should include compaction_count in result', async () => {
            const { deps } = createTestDeps();
            const context = createTestContext({ compaction_count: 2 });
            const handler = new PreCompactHandler(deps, context);

            const result = await handler.handle(createTestInput()) as PreCompactHandlerResult;

            expect(result.compaction_count).toBe(3); // incremented
        });

        it('should include commit_sha in result when memories persisted', async () => {
            const { deps } = createTestDeps();
            const context = createTestContext();
            const handler = new PreCompactHandler(deps, context);

            const result = await handler.handle(createTestInput()) as PreCompactHandlerResult;

            expect(result.commit_sha).toBeDefined();
            expect(result.commit_sha).toMatch(/^sha-/);
        });
    });

    describe('memory extraction', () => {
        it('should extract memories from input context', async () => {
            const { deps, memoryExtractor } = createTestDeps();
            const context = createTestContext({ agent_slug: 'seo-agent' });
            const handler = new PreCompactHandler(deps, context);

            const input = createTestInput({
                working_memory_summary: 'Analyzing keywords for AI workforce',
                key_decisions: ['Focus on long-tail keywords'],
                open_issues: ['CPC data incomplete'],
            });

            await handler.handle(input);

            expect(memoryExtractor.extractCalls).toHaveLength(1);
            expect(memoryExtractor.extractCalls[0].agentSlug).toBe('seo-agent');
            // Transcript should include working_memory_summary, key_decisions, open_issues
            expect(memoryExtractor.extractCalls[0].transcript).toContain('Analyzing keywords');
            expect(memoryExtractor.extractCalls[0].transcript).toContain('Focus on long-tail keywords');
            expect(memoryExtractor.extractCalls[0].transcript).toContain('CPC data incomplete');
        });

        it('should include todos in transcript', async () => {
            const { deps, memoryExtractor } = createTestDeps();
            const context = createTestContext();
            const handler = new PreCompactHandler(deps, context);

            const input = createTestInput({
                current_todos: [
                    { id: 1, status: 'in_progress', content: 'Build search index' },
                    { id: 2, status: 'pending', content: 'Write tests' },
                ],
            });

            await handler.handle(input);

            expect(memoryExtractor.extractCalls[0].transcript).toContain('Build search index');
            expect(memoryExtractor.extractCalls[0].transcript).toContain('Write tests');
        });

        it('should handle missing optional fields gracefully', async () => {
            const { deps, memoryExtractor } = createTestDeps();
            const context = createTestContext();
            const handler = new PreCompactHandler(deps, context);

            const input = createTestInput({
                current_todos: undefined,
                key_decisions: undefined,
                open_issues: undefined,
                working_memory_summary: undefined,
            });

            const result = await handler.handle(input);

            expect(result.success).toBe(true);
            expect(memoryExtractor.extractCalls).toHaveLength(1);
        });
    });

    describe('git memory persistence', () => {
        it('should write memories to git and commit', async () => {
            const { deps, gitMemoryService } = createTestDeps();
            const context = createTestContext({
                workspace_id: 'ws-123',
                agent_slug: 'seo-agent',
            });
            const handler = new PreCompactHandler(deps, context);

            await handler.handle(createTestInput());

            expect(gitMemoryService.writeAndCommitCalls).toHaveLength(1);
            const call = gitMemoryService.writeAndCommitCalls[0];
            expect(call.workspaceId).toBe('ws-123');
            expect(call.agentSlug).toBe('seo-agent');
        });

        it('should use compact-prefixed commit message', async () => {
            const { deps, gitMemoryService } = createTestDeps();
            const context = createTestContext({ agent_slug: 'seo-agent', compaction_count: 1 });
            const handler = new PreCompactHandler(deps, context);

            await handler.handle(createTestInput());

            const call = gitMemoryService.writeAndCommitCalls[0];
            expect(call.commitMessage).toMatch(/^compact:seo-agent:ctx-2:/);
        });

        it('should pass project_slug and channel_slug when available', async () => {
            const { deps, gitMemoryService } = createTestDeps();
            const context = createTestContext({
                project_slug: 'marketing',
                channel_slug: 'seo',
            });
            const handler = new PreCompactHandler(deps, context);

            await handler.handle(createTestInput());

            const call = gitMemoryService.writeAndCommitCalls[0];
            expect(call.projectSlug).toBe('marketing');
            expect(call.channelSlug).toBe('seo');
        });

        it('should trigger async pgvector indexing after commit', async () => {
            const { deps, gitMemoryService } = createTestDeps();
            const context = createTestContext({ workspace_id: 'ws-abc' });
            const handler = new PreCompactHandler(deps, context);

            await handler.handle(createTestInput());

            expect(gitMemoryService.triggerIndexingCalls).toHaveLength(1);
            expect(gitMemoryService.triggerIndexingCalls[0].workspaceId).toBe('ws-abc');
            expect(gitMemoryService.triggerIndexingCalls[0].commitSha).toMatch(/^sha-/);
        });
    });

    describe('SSE event emission', () => {
        it('should emit context_warning event for compaction', async () => {
            const { deps, sseEmitter } = createTestDeps();
            const context = createTestContext();
            const handler = new PreCompactHandler(deps, context);

            await handler.handle(createTestInput({ context_usage_percent: 92 }));

            expect(sseEmitter.emittedEvents.length).toBeGreaterThanOrEqual(1);
            const warningEvent = sseEmitter.emittedEvents.find(e => e.type === 'context_warning');
            expect(warningEvent).toBeDefined();
            expect(warningEvent?.execution_id).toBe('exec-789');
        });

        it('should include usage percentage in SSE event', async () => {
            const { deps, sseEmitter } = createTestDeps();
            const context = createTestContext();
            const handler = new PreCompactHandler(deps, context);

            await handler.handle(createTestInput({ context_usage_percent: 88 }));

            const warningEvent = sseEmitter.emittedEvents.find(e => e.type === 'context_warning');
            expect(warningEvent?.content).toMatchObject({
                percentUsed: 88,
            });
        });

        it('should indicate compaction_starting in SSE meta', async () => {
            const { deps, sseEmitter } = createTestDeps();
            const context = createTestContext();
            const handler = new PreCompactHandler(deps, context);

            await handler.handle(createTestInput({ context_usage_percent: 92 }));

            const warningEvent = sseEmitter.emittedEvents.find(e => e.type === 'context_warning');
            expect(warningEvent?.meta).toMatchObject({
                compaction_starting: true,
            });
        });
    });

    describe('context usage percent', () => {
        it('should handle low context usage without error', async () => {
            const { deps } = createTestDeps();
            const context = createTestContext();
            const handler = new PreCompactHandler(deps, context);

            const result = await handler.handle(createTestInput({ context_usage_percent: 50 }));

            expect(result.success).toBe(true);
        });

        it('should handle high context usage (near limit)', async () => {
            const { deps } = createTestDeps();
            const context = createTestContext();
            const handler = new PreCompactHandler(deps, context);

            const result = await handler.handle(createTestInput({ context_usage_percent: 98 }));

            expect(result.success).toBe(true);
        });
    });

    describe('error handling (fail-fast)', () => {
        it('should throw if memory extraction fails', async () => {
            const { deps, memoryExtractor } = createTestDeps();
            memoryExtractor.setFailure(new Error('LLM extraction failed'));
            const context = createTestContext();
            const handler = new PreCompactHandler(deps, context);

            await expect(handler.handle(createTestInput())).rejects.toThrow('LLM extraction failed');
        });

        it('should throw if git commit fails', async () => {
            const { deps, gitMemoryService } = createTestDeps();
            gitMemoryService.setFailure(new Error('Git write error'));
            const context = createTestContext();
            const handler = new PreCompactHandler(deps, context);

            await expect(handler.handle(createTestInput())).rejects.toThrow('Git write error');
        });
    });

    describe('compaction counter', () => {
        it('should increment compaction count starting from 0', async () => {
            const { deps } = createTestDeps();
            const context = createTestContext({ compaction_count: 0 });
            const handler = new PreCompactHandler(deps, context);

            const result = await handler.handle(createTestInput()) as PreCompactHandlerResult;

            expect(result.compaction_count).toBe(1);
        });

        it('should increment compaction count from existing value', async () => {
            const { deps } = createTestDeps();
            const context = createTestContext({ compaction_count: 5 });
            const handler = new PreCompactHandler(deps, context);

            const result = await handler.handle(createTestInput()) as PreCompactHandlerResult;

            expect(result.compaction_count).toBe(6);
        });
    });

    describe('transcript building', () => {
        it('should build structured transcript from all input fields', async () => {
            const { deps, memoryExtractor } = createTestDeps();
            const context = createTestContext();
            const handler = new PreCompactHandler(deps, context);

            const input = createTestInput({
                context_usage_percent: 90,
                working_memory_summary: 'Building a REST API',
                key_decisions: ['Use Express', 'PostgreSQL for storage'],
                open_issues: ['Auth middleware pending', 'Rate limiting TBD'],
                current_todos: [
                    { id: 1, status: 'completed', content: 'Set up project' },
                    { id: 2, status: 'in_progress', content: 'Implement routes' },
                ],
            });

            await handler.handle(input);

            const transcript = memoryExtractor.extractCalls[0].transcript;
            expect(transcript).toContain('Building a REST API');
            expect(transcript).toContain('Use Express');
            expect(transcript).toContain('PostgreSQL for storage');
            expect(transcript).toContain('Auth middleware pending');
            expect(transcript).toContain('Set up project');
            expect(transcript).toContain('Implement routes');
            expect(transcript).toContain('90');
        });
    });
});

describe('createPreCompactHandler', () => {
    it('should create a handler function', () => {
        const { deps } = createTestDeps();
        const context = createTestContext();
        const handlerFn = createPreCompactHandler(deps, context);

        expect(typeof handlerFn).toBe('function');
    });

    it('should return HookResult-compatible output', async () => {
        const { deps } = createTestDeps();
        const context = createTestContext();
        const handlerFn = createPreCompactHandler(deps, context);

        const result = await handlerFn(createTestInput());

        expect(result.success).toBe(true);
    });

    it('should include compaction count in result', async () => {
        const { deps } = createTestDeps();
        const context = createTestContext({ compaction_count: 0 });
        const handlerFn = createPreCompactHandler(deps, context);

        const result = await handlerFn(createTestInput()) as PreCompactHandlerResult;

        expect(result.compaction_count).toBe(1);
    });
});
