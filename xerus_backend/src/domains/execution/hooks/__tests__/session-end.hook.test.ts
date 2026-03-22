// SessionEnd Hook Tests
// Tests for clean shutdown and memory persistence

import {
    SessionEndHandler,
    createSessionEndHandler,
} from '../session-end.hook';
import type { SessionEndHandlerResult, SessionEndContext } from '../session-end.types';
import { SessionEndInput, HookResult } from '../hooks.types';
import { createTestSessionEndDeps } from './test-implementations';

// -----------------------------------------------------------------------------
// Test Utilities
// -----------------------------------------------------------------------------

function createSessionEndInput(overrides: Partial<SessionEndInput> = {}): SessionEndInput {
    return {
        session_id: 'session-123',
        transcript_path: '/workspace/agents/test-agent/transcript.json',
        cwd: '/workspace/agents/test-agent',
        permission_mode: 'default',
        agent_id: 'agent-123',
        user_id: 'user-456',
        session_summary: 'Completed task successfully',
        learnings: ['Learned to use new API', 'Discovered caching pattern'],
        memory_updates: [{ type: 'expertise', content: 'New fact learned' }],
        will_pause: true,
        checkpoint: { step: 5, state: 'completed' },
        final_response: 'Task completed successfully.',
        tool_calls: [
            { name: 'WebSearch', success: true },
            { name: 'Write', success: true },
        ],
        usage: { input_tokens: 1500, output_tokens: 800 },
        ...overrides,
    };
}

function createSessionEndContext(overrides: Partial<SessionEndContext> = {}): SessionEndContext {
    return {
        agent_id: 123,
        agent_slug: 'test-agent',
        user_id: 'user-456',
        workspace_id: 'workspace-001',
        run_id: 'run-789',
        session_start_time: new Date(Date.now() - 180_000), // 3 minutes ago
        is_async_task: false,
        channel_id: 'channel-001',
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('SessionEndHandler', () => {
    describe('constructor', () => {
        it('should create handler with required dependencies', () => {
            const deps = createTestSessionEndDeps();
            const context = createSessionEndContext();
            const handler = new SessionEndHandler(deps, context);

            expect(handler).toBeInstanceOf(SessionEndHandler);
        });
    });

    describe('handle', () => {
        it('should return successful result on normal execution', async () => {
            const deps = createTestSessionEndDeps();
            const context = createSessionEndContext();
            const handler = new SessionEndHandler(deps, context);

            const result = await handler.handle(createSessionEndInput());

            expect(result.success).toBe(true);
        });

        it('should extract and persist memories to git repo', async () => {
            const deps = createTestSessionEndDeps();
            const context = createSessionEndContext({ agent_slug: 'seo-agent', workspace_id: 'ws-123' });
            const handler = new SessionEndHandler(deps, context);

            await handler.handle(createSessionEndInput({
                final_response: 'Completed keyword research',
                session_id: 'sess-abc',
            }));

            // Should extract memories
            expect(deps.memoryExtractor.extractCalls.wasCalled()).toBe(true);
            const extractCall = deps.memoryExtractor.extractCalls.getLastCall();
            expect(extractCall?.args[1]).toBe('seo-agent'); // agentSlug

            // Should write to git and commit
            expect(deps.gitMemoryService.writeAndCommitCalls.wasCalled()).toBe(true);
            const commitCall = deps.gitMemoryService.writeAndCommitCalls.getLastCall();
            expect(commitCall?.args[0].workspaceId).toBe('ws-123');
            expect(commitCall?.args[0].agentSlug).toBe('seo-agent');
            expect(commitCall?.args[0].commitMessage).toContain('session-end:seo-agent:');

            // Should trigger async indexing
            expect(deps.gitMemoryService.triggerIndexingCalls.wasCalled()).toBe(true);
        });

        it('should skip memory extraction if no transcript content', async () => {
            const deps = createTestSessionEndDeps();
            const context = createSessionEndContext();
            const handler = new SessionEndHandler(deps, context);

            // No final_response and no tool_calls
            const result = await handler.handle(createSessionEndInput({
                final_response: undefined,
                tool_calls: undefined,
            }));

            expect(result.success).toBe(true);
            expect(deps.memoryExtractor.extractCalls.wasCalled()).toBe(false);
            expect(deps.gitMemoryService.writeAndCommitCalls.wasCalled()).toBe(false);
        });

        it('should trigger ACE reflection asynchronously', async () => {
            const deps = createTestSessionEndDeps();
            const context = createSessionEndContext({ agent_id: 789 });
            const handler = new SessionEndHandler(deps, context);

            const input = createSessionEndInput({
                session_id: 'sess-xyz',
                final_response: 'Done!',
                tool_calls: [{ name: 'Bash', args: {} }],
            });

            await handler.handle(input);

            expect(deps.aceService.triggerReflectionCalls.wasCalled()).toBe(true);
            const lastCall = deps.aceService.triggerReflectionCalls.getLastCall();
            expect(lastCall?.args[0]).toEqual({
                agent_id: 789,
                session_id: 'sess-xyz',
                response: 'Done!',
                tool_calls: [{ name: 'Bash', args: {} }],
            });
        });

        it('should update execution_sessions with completion stats', async () => {
            const deps = createTestSessionEndDeps();
            const context = createSessionEndContext({ run_id: 'run-123' });
            const handler = new SessionEndHandler(deps, context);

            const input = createSessionEndInput({
                usage: { input_tokens: 2000, output_tokens: 1000 },
                tool_calls: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
            });

            await handler.handle(input);

            expect(deps.executionSessionRepository.updateSessionCalls.wasCalled()).toBe(true);
            const lastCall = deps.executionSessionRepository.updateSessionCalls.getLastCall();
            expect(lastCall?.args[0]).toBe('run-123');
            expect(lastCall?.args[1]).toMatchObject({
                status: 'completed',
                input_tokens: 2000,
                output_tokens: 1000,
            });
        });

        it('should emit session_ended SSE event', async () => {
            const deps = createTestSessionEndDeps();
            const context = createSessionEndContext({ run_id: 'run-456' });
            const handler = new SessionEndHandler(deps, context);

            await handler.handle(createSessionEndInput({ final_response: 'All done!' }));

            expect(deps.streamHandler.sendCalls.wasCalled()).toBe(true);
            const lastCall = deps.streamHandler.sendCalls.getLastCall();
            expect(lastCall?.args[0]).toBe('session_ended');
            expect(lastCall?.args[1]).toMatchObject({
                run_id: 'run-456',
                final_response: 'All done!',
            });
        });
    });

    describe('sandbox lifecycle decision', () => {
        it('should pause sandbox for short sessions (<5 min) when will_pause is true', async () => {
            const deps = createTestSessionEndDeps({ activeExecutionCount: 0 });
            const context = createSessionEndContext({
                session_start_time: new Date(Date.now() - 180_000), // 3 minutes ago
            });
            const handler = new SessionEndHandler(deps, context);

            await handler.handle(createSessionEndInput({ will_pause: true }));

            expect(deps.sandboxService.pauseSandboxCalls.wasCalled()).toBe(true);
            expect(deps.sandboxService.pauseSandboxCalls.wasCalledWith('user-456')).toBe(true);
        });

        it('should NOT pause sandbox when will_pause is false', async () => {
            const deps = createTestSessionEndDeps();
            const context = createSessionEndContext();
            const handler = new SessionEndHandler(deps, context);

            await handler.handle(createSessionEndInput({ will_pause: false }));

            expect(deps.sandboxService.pauseSandboxCalls.wasCalled()).toBe(false);
        });

        it('should NOT pause sandbox when there are active executions', async () => {
            const deps = createTestSessionEndDeps({ activeExecutionCount: 2 });
            const context = createSessionEndContext();
            const handler = new SessionEndHandler(deps, context);

            await handler.handle(createSessionEndInput({ will_pause: true }));

            expect(deps.sandboxService.pauseSandboxCalls.wasCalled()).toBe(false);
        });

        it('should include sandbox_paused in result when paused', async () => {
            const deps = createTestSessionEndDeps({ activeExecutionCount: 0 });
            const context = createSessionEndContext();
            const handler = new SessionEndHandler(deps, context);

            const result = (await handler.handle(createSessionEndInput({ will_pause: true }))) as SessionEndHandlerResult;

            expect(result.sandbox_paused).toBe(true);
        });
    });

    describe('skill creation opportunity', () => {
        it('should check for skill opportunity when response contains novel solution', async () => {
            const deps = createTestSessionEndDeps();
            deps.skillSuggester.setSuggestion('deploy-script');
            const context = createSessionEndContext();
            const handler = new SessionEndHandler(deps, context);

            const input = createSessionEndInput({
                final_response: 'Created a new deployment pipeline',
                tool_calls: [{ name: 'Write' }, { name: 'Bash' }],
            });

            const result = (await handler.handle(input)) as SessionEndHandlerResult;

            expect(deps.skillSuggester.checkForSkillOpportunityCalls.wasCalled()).toBe(true);
            expect(result.skill_suggestion).toBe('deploy-script');
        });

        it('should not fail if skill suggester returns null', async () => {
            const deps = createTestSessionEndDeps();
            deps.skillSuggester.setSuggestion(null);
            const context = createSessionEndContext();
            const handler = new SessionEndHandler(deps, context);

            const result = (await handler.handle(createSessionEndInput())) as SessionEndHandlerResult;

            expect(result.skill_suggestion).toBeUndefined();
        });
    });

    describe('DRM compression', () => {
        it('should compress old episodic entries after memory extraction', async () => {
            const deps = createTestSessionEndDeps();
            deps.drmCompressor.setEntriesCompressed(5);
            const context = createSessionEndContext({ workspace_id: 'ws-drm', agent_slug: 'drm-agent' });
            const handler = new SessionEndHandler(deps, context);

            const result = (await handler.handle(createSessionEndInput())) as SessionEndHandlerResult;

            expect(deps.drmCompressor.compressWorkingMemoryCalls.wasCalled()).toBe(true);
            const lastCall = deps.drmCompressor.compressWorkingMemoryCalls.getLastCall();
            expect(lastCall?.args[0]).toEqual({ workspaceId: 'ws-drm', agentSlug: 'drm-agent' });
            expect(result.entries_compressed).toBe(5);
        });

        it('should return 0 entries_compressed when nothing to compress', async () => {
            const deps = createTestSessionEndDeps();
            const context = createSessionEndContext();
            const handler = new SessionEndHandler(deps, context);

            const result = (await handler.handle(createSessionEndInput())) as SessionEndHandlerResult;

            expect(result.entries_compressed).toBe(0);
        });

        it('should throw if DRM compression fails (fail-fast)', async () => {
            const deps = createTestSessionEndDeps();
            deps.drmCompressor.setFailure(new Error('DRM compression error'));
            const context = createSessionEndContext();
            const handler = new SessionEndHandler(deps, context);

            await expect(handler.handle(createSessionEndInput())).rejects.toThrow('DRM compression error');
        });
    });

    describe('async task handling', () => {
        it('should include channel notification for async tasks', async () => {
            const deps = createTestSessionEndDeps();
            const context = createSessionEndContext({
                is_async_task: true,
                channel_id: 'channel-async',
            });
            const handler = new SessionEndHandler(deps, context);

            const result = (await handler.handle(createSessionEndInput())) as SessionEndHandlerResult;

            expect(result.channel_notified).toBe(true);
        });

        it('should not notify channel for sync tasks', async () => {
            const deps = createTestSessionEndDeps();
            const context = createSessionEndContext({ is_async_task: false });
            const handler = new SessionEndHandler(deps, context);

            const result = (await handler.handle(createSessionEndInput())) as SessionEndHandlerResult;

            expect(result.channel_notified).toBeUndefined();
        });
    });

    describe('error handling (fail-fast)', () => {
        it('should throw if memory extraction fails', async () => {
            const deps = createTestSessionEndDeps();
            deps.memoryExtractor.setFailure(new Error('Extraction error'));
            const context = createSessionEndContext();
            const handler = new SessionEndHandler(deps, context);

            await expect(handler.handle(createSessionEndInput())).rejects.toThrow('Extraction error');
        });

        it('should throw if git commit fails', async () => {
            const deps = createTestSessionEndDeps();
            deps.gitMemoryService.setFailure(new Error('Git commit error'));
            const context = createSessionEndContext();
            const handler = new SessionEndHandler(deps, context);

            await expect(handler.handle(createSessionEndInput())).rejects.toThrow('Git commit error');
        });

        it('should throw if ACE reflection fails', async () => {
            const deps = createTestSessionEndDeps();
            deps.aceService.setFailure(new Error('ACE error'));
            const context = createSessionEndContext();
            const handler = new SessionEndHandler(deps, context);

            await expect(handler.handle(createSessionEndInput())).rejects.toThrow('ACE error');
        });

        it('should return sandbox_paused false if pause returns false', async () => {
            const deps = createTestSessionEndDeps({ activeExecutionCount: 0 });
            deps.sandboxService.setPauseSuccess(false);
            const context = createSessionEndContext();
            const handler = new SessionEndHandler(deps, context);

            const result = (await handler.handle(createSessionEndInput({ will_pause: true }))) as SessionEndHandlerResult;

            expect(result.success).toBe(true);
            expect(result.sandbox_paused).toBe(false);
        });
    });

    describe('duration calculation', () => {
        it('should calculate session duration correctly', async () => {
            const deps = createTestSessionEndDeps();
            const sessionStart = new Date(Date.now() - 600_000); // 10 minutes ago
            const context = createSessionEndContext({ session_start_time: sessionStart });
            const handler = new SessionEndHandler(deps, context);

            await handler.handle(createSessionEndInput());

            expect(deps.executionSessionRepository.updateSessionCalls.wasCalled()).toBe(true);
            const lastCall = deps.executionSessionRepository.updateSessionCalls.getLastCall();
            expect(lastCall?.args[1].completed_at).toBeDefined();
        });
    });
});

describe('createSessionEndHandler', () => {
    it('should create a handler function', () => {
        const deps = createTestSessionEndDeps();
        const context = createSessionEndContext();
        const handlerFn = createSessionEndHandler(deps, context);

        expect(typeof handlerFn).toBe('function');
    });

    it('should return HookResult-compatible output', async () => {
        const deps = createTestSessionEndDeps();
        const context = createSessionEndContext();
        const handlerFn = createSessionEndHandler(deps, context);

        const result: HookResult = await handlerFn(createSessionEndInput());

        expect(result.success).toBe(true);
    });
});
