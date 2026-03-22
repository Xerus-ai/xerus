// UserPromptSubmit Hook Tests
// Tests for primary context preparation hook

import {
    UserPromptSubmitHandler,
    UserPromptSubmitHandlerResult,
    UserPromptSubmitContext,
    createUserPromptSubmitHandler,
} from '../user-prompt-submit.hook';
import { UserPromptSubmitInput, HookResult } from '../hooks.types';
import { createTestUserPromptSubmitDeps } from './user-prompt-submit-test-deps';

// -----------------------------------------------------------------------------
// Test Utilities
// -----------------------------------------------------------------------------

function createUserPromptSubmitInput(overrides: Partial<UserPromptSubmitInput> = {}): UserPromptSubmitInput {
    return {
        session_id: 'session-123',
        transcript_path: '/workspace/agents/test-agent/transcript.json',
        cwd: '/workspace/agents/test-agent',
        permission_mode: 'default',
        prompt: 'Research competitors in the AI space',
        agent_id: 'agent-123',
        user_id: 'user-456',
        trigger_type: 'user_message',
        ...overrides,
    };
}

function createUserPromptSubmitContext(overrides: Partial<UserPromptSubmitContext> = {}): UserPromptSubmitContext {
    return {
        agent_id: 123,
        agent_slug: 'test-agent',
        user_id: 'user-456',
        trigger_type: 'user_message',
        trigger_payload: {},
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('UserPromptSubmitHandler', () => {
    describe('constructor', () => {
        it('should create handler with required dependencies', () => {
            const deps = createTestUserPromptSubmitDeps();
            const context = createUserPromptSubmitContext();
            const handler = new UserPromptSubmitHandler(deps, context);

            expect(handler).toBeInstanceOf(UserPromptSubmitHandler);
        });
    });

    describe('handle', () => {
        it('should return successful result on normal execution', async () => {
            const deps = createTestUserPromptSubmitDeps();
            const context = createUserPromptSubmitContext();
            const handler = new UserPromptSubmitHandler(deps, context);

            const result = await handler.handle(createUserPromptSubmitInput());

            expect(result.success).toBe(true);
        });

        it('should call contextBuilder.buildContextFiles with correct params', async () => {
            const deps = createTestUserPromptSubmitDeps();
            const context = createUserPromptSubmitContext({
                agent_slug: 'scout-sally',
                user_id: 'user-789',
                trigger_type: 'heartbeat',
                trigger_payload: { schedule_id: 'sched-1' },
            });
            const handler = new UserPromptSubmitHandler(deps, context);

            await handler.handle(createUserPromptSubmitInput());

            expect(deps.contextBuilder.buildContextFilesCalls.wasCalled()).toBe(true);
            const lastCall = deps.contextBuilder.buildContextFilesCalls.getLastCall();
            expect(lastCall?.args[0]).toEqual({
                agentSlug: 'scout-sally',
                userId: 'user-789',
                triggerType: 'heartbeat',
                triggerPayload: { schedule_id: 'sched-1' },
            });
        });

        it('should return additionalContext pointing to context/index.md', async () => {
            const deps = createTestUserPromptSubmitDeps();
            const context = createUserPromptSubmitContext();
            const handler = new UserPromptSubmitHandler(deps, context);

            const result = (await handler.handle(createUserPromptSubmitInput())) as UserPromptSubmitHandlerResult;

            expect(result.additional_context).toBe('Context files ready at context/index.md');
        });

        it('should include filesWritten in result', async () => {
            const deps = createTestUserPromptSubmitDeps();
            deps.contextBuilder.setResult({
                success: true,
                indexPath: 'context/index.md',
                filesWritten: ['context/ace/playbook.md', 'context/index.md'],
            });
            const context = createUserPromptSubmitContext();
            const handler = new UserPromptSubmitHandler(deps, context);

            const result = (await handler.handle(createUserPromptSubmitInput())) as UserPromptSubmitHandlerResult;

            expect(result.files_written).toEqual(['context/ace/playbook.md', 'context/index.md']);
        });

        it('should refresh context index after building files', async () => {
            const deps = createTestUserPromptSubmitDeps();
            const context = createUserPromptSubmitContext({ agent_slug: 'my-agent' });
            const handler = new UserPromptSubmitHandler(deps, context);

            await handler.handle(createUserPromptSubmitInput());

            expect(deps.workspaceManager.refreshContextIndexCalls.wasCalled()).toBe(true);
            expect(deps.workspaceManager.refreshContextIndexCalls.wasCalledWith('my-agent')).toBe(true);
        });
    });

    describe('trigger-specific behavior', () => {
        it('should pass user_message trigger payload', async () => {
            const deps = createTestUserPromptSubmitDeps();
            const context = createUserPromptSubmitContext({
                trigger_type: 'user_message',
                trigger_payload: { channel_id: 'ch-123', thread_id: 'th-456' },
            });
            const handler = new UserPromptSubmitHandler(deps, context);

            await handler.handle(createUserPromptSubmitInput({ trigger_type: 'user_message' }));

            const lastCall = deps.contextBuilder.buildContextFilesCalls.getLastCall();
            expect(lastCall?.args[0]).toMatchObject({
                triggerType: 'user_message',
                triggerPayload: { channel_id: 'ch-123', thread_id: 'th-456' },
            });
        });

        it('should pass heartbeat trigger payload', async () => {
            const deps = createTestUserPromptSubmitDeps();
            const context = createUserPromptSubmitContext({
                trigger_type: 'heartbeat',
                trigger_payload: { snapshot_data: { key: 'value' } },
            });
            const handler = new UserPromptSubmitHandler(deps, context);

            await handler.handle(createUserPromptSubmitInput({ trigger_type: 'heartbeat' }));

            const lastCall = deps.contextBuilder.buildContextFilesCalls.getLastCall();
            expect(lastCall?.args[0]).toMatchObject({
                triggerType: 'heartbeat',
                triggerPayload: { snapshot_data: { key: 'value' } },
            });
        });

        it('should pass schedule trigger payload', async () => {
            const deps = createTestUserPromptSubmitDeps();
            const context = createUserPromptSubmitContext({
                trigger_type: 'schedule',
                trigger_payload: { schedule_id: 'sched-1', input_template: 'Check sales' },
            });
            const handler = new UserPromptSubmitHandler(deps, context);

            await handler.handle(createUserPromptSubmitInput({ trigger_type: 'schedule' }));

            const lastCall = deps.contextBuilder.buildContextFilesCalls.getLastCall();
            expect(lastCall?.args[0]).toMatchObject({
                triggerType: 'schedule',
                triggerPayload: { schedule_id: 'sched-1', input_template: 'Check sales' },
            });
        });

        it('should pass team trigger payload', async () => {
            const deps = createTestUserPromptSubmitDeps();
            const context = createUserPromptSubmitContext({
                trigger_type: 'team',
                trigger_payload: { team_id: 'team-1', coordination_mode: 'parallel' },
            });
            const handler = new UserPromptSubmitHandler(deps, context);

            await handler.handle(createUserPromptSubmitInput({ trigger_type: 'team' }));

            const lastCall = deps.contextBuilder.buildContextFilesCalls.getLastCall();
            expect(lastCall?.args[0]).toMatchObject({
                triggerType: 'team',
                triggerPayload: { team_id: 'team-1', coordination_mode: 'parallel' },
            });
        });

        it('should pass mention trigger payload', async () => {
            const deps = createTestUserPromptSubmitDeps();
            const context = createUserPromptSubmitContext({
                trigger_type: 'mention',
                trigger_payload: { mention_id: 'mention-1', mentioner_id: 'user-x' },
            });
            const handler = new UserPromptSubmitHandler(deps, context);

            await handler.handle(createUserPromptSubmitInput({ trigger_type: 'mention' }));

            const lastCall = deps.contextBuilder.buildContextFilesCalls.getLastCall();
            expect(lastCall?.args[0]).toMatchObject({
                triggerType: 'mention',
                triggerPayload: { mention_id: 'mention-1', mentioner_id: 'user-x' },
            });
        });
    });

    describe('ACE playbook writing', () => {
        it('should call aceContextWriter with agent_id and agent_slug', async () => {
            const deps = createTestUserPromptSubmitDeps();
            const context = createUserPromptSubmitContext({ agent_id: 42, agent_slug: 'seo-agent' });
            const handler = new UserPromptSubmitHandler(deps, context);

            await handler.handle(createUserPromptSubmitInput());

            expect(deps.aceContextWriter.writeContextFileCalls.wasCalled()).toBe(true);
            const lastCall = deps.aceContextWriter.writeContextFileCalls.getLastCall();
            expect(lastCall?.args[0]).toEqual({ agent_id: 42, agent_slug: 'seo-agent' });
        });

        it('should include ACE file in files_written when entries exist', async () => {
            const deps = createTestUserPromptSubmitDeps();
            deps.aceContextWriter.setResult({
                success: true,
                file_path: 'context/ace/playbook.md',
                entries_written: 5,
                cached: false,
            });
            const context = createUserPromptSubmitContext();
            const handler = new UserPromptSubmitHandler(deps, context);

            const result = (await handler.handle(createUserPromptSubmitInput())) as UserPromptSubmitHandlerResult;

            expect(result.files_written).toContain('context/ace/playbook.md');
            expect(result.ace_entries_written).toBe(5);
        });

        it('should not include ACE file in files_written when no entries', async () => {
            const deps = createTestUserPromptSubmitDeps();
            deps.contextBuilder.setResult({
                success: true,
                indexPath: 'context/index.md',
                filesWritten: ['context/index.md'],
            });
            deps.aceContextWriter.setResult({
                success: true,
                file_path: 'context/ace/playbook.md',
                entries_written: 0,
                cached: false,
            });
            const context = createUserPromptSubmitContext();
            const handler = new UserPromptSubmitHandler(deps, context);

            const result = (await handler.handle(createUserPromptSubmitInput())) as UserPromptSubmitHandlerResult;

            expect(result.files_written).not.toContain('context/ace/playbook.md');
            expect(result.ace_entries_written).toBe(0);
        });

        it('should throw if ACE context writer fails (fail-fast)', async () => {
            const deps = createTestUserPromptSubmitDeps();
            deps.aceContextWriter.setFailure(new Error('ACE DB connection failed'));
            const context = createUserPromptSubmitContext();
            const handler = new UserPromptSubmitHandler(deps, context);

            await expect(handler.handle(createUserPromptSubmitInput())).rejects.toThrow('ACE DB connection failed');
        });
    });

    describe('error handling', () => {
        it('should fail if contextBuilder fails', async () => {
            const deps = createTestUserPromptSubmitDeps();
            deps.contextBuilder.setFailure(new Error('Context build failed'));
            const context = createUserPromptSubmitContext();
            const handler = new UserPromptSubmitHandler(deps, context);

            await expect(handler.handle(createUserPromptSubmitInput())).rejects.toThrow('Context build failed');
        });

        it('should fail if contextBuilder returns success: false', async () => {
            const deps = createTestUserPromptSubmitDeps();
            deps.contextBuilder.setResult({
                success: false,
                indexPath: '',
                filesWritten: [],
            });
            const context = createUserPromptSubmitContext();
            const handler = new UserPromptSubmitHandler(deps, context);

            await expect(handler.handle(createUserPromptSubmitInput())).rejects.toThrow(
                'Context build failed for agent'
            );
        });

        it('should log warning but not fail if refreshContextIndex fails', async () => {
            const deps = createTestUserPromptSubmitDeps();
            deps.workspaceManager.setFailure(new Error('Refresh failed'));
            const context = createUserPromptSubmitContext();
            const handler = new UserPromptSubmitHandler(deps, context);

            const result = await handler.handle(createUserPromptSubmitInput());

            // Handler gracefully handles refresh failure - returns success
            expect(result.success).toBe(true);
            // Context build still succeeds (only refresh fails)
            expect(deps.contextBuilder.buildContextFilesCalls.wasCalled()).toBe(true);
        });
    });

    describe('result structure', () => {
        it('should return HookResult-compatible result', async () => {
            const deps = createTestUserPromptSubmitDeps();
            const context = createUserPromptSubmitContext();
            const handler = new UserPromptSubmitHandler(deps, context);

            const result: HookResult = await handler.handle(createUserPromptSubmitInput());

            expect(result).toHaveProperty('success');
            expect(typeof result.success).toBe('boolean');
        });

        it('should include all expected fields in result', async () => {
            const deps = createTestUserPromptSubmitDeps();
            const context = createUserPromptSubmitContext();
            const handler = new UserPromptSubmitHandler(deps, context);

            const result = (await handler.handle(createUserPromptSubmitInput())) as UserPromptSubmitHandlerResult;

            expect(result).toMatchObject({
                success: true,
                additional_context: expect.any(String),
                files_written: expect.any(Array),
            });
        });
    });
});

describe('createUserPromptSubmitHandler', () => {
    it('should create a handler function', () => {
        const deps = createTestUserPromptSubmitDeps();
        const context = createUserPromptSubmitContext();
        const handlerFn = createUserPromptSubmitHandler(deps, context);

        expect(typeof handlerFn).toBe('function');
    });

    it('should return HookResult-compatible output', async () => {
        const deps = createTestUserPromptSubmitDeps();
        const context = createUserPromptSubmitContext();
        const handlerFn = createUserPromptSubmitHandler(deps, context);

        const result: HookResult = await handlerFn(createUserPromptSubmitInput());

        expect(result.success).toBe(true);
    });
});
