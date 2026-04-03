// ACE Reflection Trigger Tests
// Tests for async reflection pipeline (Generator -> Reflector -> Curator)

import {
    ACEReflectionTrigger,
    ACEReflectionTriggerParams,
    createACEReflectionTrigger,
} from '../ace-reflection.trigger';
import { createTestACEReflectionDeps } from './test-implementations';

// -----------------------------------------------------------------------------
// Test Utilities
// -----------------------------------------------------------------------------

function createReflectionParams(overrides: Partial<ACEReflectionTriggerParams> = {}): ACEReflectionTriggerParams {
    return {
        agent_id: 123,
        session_id: 'session-abc',
        response: 'Task completed successfully. I used the WebSearch tool to find information.',
        tool_calls: [
            { name: 'WebSearch', success: true, duration_ms: 500 },
            { name: 'Write', success: true, duration_ms: 200 },
        ],
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('ACEReflectionTrigger', () => {
    describe('constructor', () => {
        it('should create trigger with required dependencies', () => {
            const deps = createTestACEReflectionDeps();
            const trigger = new ACEReflectionTrigger(deps);

            expect(trigger).toBeInstanceOf(ACEReflectionTrigger);
        });
    });

    describe('trigger', () => {
        it('should return successful result when pipeline completes', async () => {
            const deps = createTestACEReflectionDeps();
            const trigger = new ACEReflectionTrigger(deps);

            const result = await trigger.trigger(createReflectionParams());

            expect(result.success).toBe(true);
            expect(result.reflected).toBe(true);
            expect(result.curated).toBe(true);
        });

        it('should call reflector with execution context', async () => {
            const deps = createTestACEReflectionDeps();
            const trigger = new ACEReflectionTrigger(deps);

            const params = createReflectionParams({
                agent_id: 456,
                session_id: 'sess-xyz',
                response: 'Completed analysis task',
                tool_calls: [{ name: 'Bash', success: true }],
            });

            await trigger.trigger(params);

            expect(deps.reflector.analyzeCalls.wasCalled()).toBe(true);
            const lastCall = deps.reflector.analyzeCalls.getLastCall();
            expect(lastCall?.args[0]).toEqual({
                agent_id: 456,
                session_id: 'sess-xyz',
                response: 'Completed analysis task',
                tool_calls: [{ name: 'Bash', success: true }],
            });
        });

        it('should pass reflector analysis to curator', async () => {
            const deps = createTestACEReflectionDeps();
            deps.reflector.setAnalysisResult({
                qualityScores: { overall: 0.85, relevance: 0.9 },
                insights: [{ type: 'success_pattern', content: 'Good approach' }],
                errors: [],
            });
            const trigger = new ACEReflectionTrigger(deps);

            await trigger.trigger(createReflectionParams({ agent_id: 789 }));

            expect(deps.curator.curateCalls.wasCalled()).toBe(true);
            const lastCall = deps.curator.curateCalls.getLastCall();
            expect(lastCall?.args[0]).toBe(789); // agent_id
            expect(lastCall?.args[1]).toMatchObject({
                qualityScores: { overall: 0.85, relevance: 0.9 },
                insights: [{ type: 'success_pattern', content: 'Good approach' }],
            });
        });

        it('should emit ace:reflected event after reflection', async () => {
            const deps = createTestACEReflectionDeps();
            deps.reflector.setAnalysisResult({
                qualityScores: { overall: 0.72 },
                insights: [{ type: 'test' }, { type: 'test' }],
                errors: [],
            });
            const trigger = new ACEReflectionTrigger(deps);

            await trigger.trigger(createReflectionParams({ agent_id: 100 }));

            expect(deps.eventEmitter.wasCalledWith('ace:reflected')).toBe(true);
            const emittedData = deps.eventEmitter.getLastEmittedData('ace:reflected');
            expect(emittedData).toMatchObject({
                agent_id: 100,
                quality_score: 0.72,
                insights_count: 2,
            });
        });

        it('should emit ace:curated event after curation', async () => {
            const deps = createTestACEReflectionDeps();
            deps.curator.setCurationResult({
                added: [{ id: 'new-1', content: 'New insight' }],
                updated: [{ id: 'upd-1', newHelpfulness: 0.8 }],
                deprecated: [{ id: 'dep-1', reason: 'Low helpfulness' }],
            });
            const trigger = new ACEReflectionTrigger(deps);

            await trigger.trigger(createReflectionParams({ agent_id: 200 }));

            expect(deps.eventEmitter.wasCalledWith('ace:curated')).toBe(true);
            const emittedData = deps.eventEmitter.getLastEmittedData('ace:curated');
            expect(emittedData).toMatchObject({
                agent_id: 200,
                added: 1,
                updated: 1,
                deprecated: 1,
            });
        });

        it('should update ace_state with reflection count', async () => {
            const deps = createTestACEReflectionDeps();
            const trigger = new ACEReflectionTrigger(deps);

            await trigger.trigger(createReflectionParams({ agent_id: 300 }));

            expect(deps.aceStateRepository.incrementReflectionCountCalls.wasCalled()).toBe(true);
            expect(deps.aceStateRepository.incrementReflectionCountCalls.wasCalledWith(300)).toBe(true);
        });

        it('should include reflection and curation results in output', async () => {
            const deps = createTestACEReflectionDeps();
            deps.reflector.setAnalysisResult({
                qualityScores: { overall: 0.9 },
                insights: [{ type: 'success' }],
                errors: [],
            });
            deps.curator.setCurationResult({
                added: [{ id: '1' }],
                updated: [],
                deprecated: [],
            });
            const trigger = new ACEReflectionTrigger(deps);

            const result = await trigger.trigger(createReflectionParams());

            expect(result.analysis?.qualityScores.overall).toBe(0.9);
            expect(result.changes?.added.length).toBe(1);
        });
    });

    describe('rate limiting', () => {
        it('should skip reflection when rate limited', async () => {
            const deps = createTestACEReflectionDeps();
            deps.rateLimiter.setLimited(true);
            const trigger = new ACEReflectionTrigger(deps);

            const result = await trigger.trigger(createReflectionParams());

            expect(result.success).toBe(true);
            expect(result.reflected).toBe(false);
            expect(result.skipped_reason).toBe('rate_limited');
            expect(deps.reflector.analyzeCalls.wasCalled()).toBe(false);
        });

        it('should record reflection attempt for rate limiting', async () => {
            const deps = createTestACEReflectionDeps();
            const trigger = new ACEReflectionTrigger(deps);

            await trigger.trigger(createReflectionParams({ agent_id: 400 }));

            expect(deps.rateLimiter.recordAttemptCalls.wasCalled()).toBe(true);
            expect(deps.rateLimiter.recordAttemptCalls.wasCalledWith(400)).toBe(true);
        });

        it('should check rate limit before attempting reflection', async () => {
            const deps = createTestACEReflectionDeps();
            const trigger = new ACEReflectionTrigger(deps);

            await trigger.trigger(createReflectionParams({ agent_id: 500 }));

            expect(deps.rateLimiter.isLimitedCalls.wasCalled()).toBe(true);
            expect(deps.rateLimiter.isLimitedCalls.wasCalledWith(500)).toBe(true);
        });
    });

    describe('error handling (graceful failures)', () => {
        it('should not throw when reflector fails', async () => {
            const deps = createTestACEReflectionDeps();
            deps.reflector.setFailure(new Error('Reflector LLM error'));
            const trigger = new ACEReflectionTrigger(deps);

            const result = await trigger.trigger(createReflectionParams());

            expect(result.success).toBe(false);
            expect(result.reflected).toBe(false);
            expect(result.error).toBe('Reflector LLM error');
        });

        it('should not throw when curator fails', async () => {
            const deps = createTestACEReflectionDeps();
            deps.curator.setFailure(new Error('Curator DB error'));
            const trigger = new ACEReflectionTrigger(deps);

            const result = await trigger.trigger(createReflectionParams());

            expect(result.success).toBe(false);
            expect(result.reflected).toBe(true);
            expect(result.curated).toBe(false);
            expect(result.error).toBe('Curator DB error');
        });

        it('should emit ace:reflection_error event on failure', async () => {
            const deps = createTestACEReflectionDeps();
            deps.reflector.setFailure(new Error('Test error'));
            const trigger = new ACEReflectionTrigger(deps);

            await trigger.trigger(createReflectionParams({ agent_id: 600 }));

            expect(deps.eventEmitter.wasCalledWith('ace:reflection_error')).toBe(true);
            const emittedData = deps.eventEmitter.getLastEmittedData('ace:reflection_error');
            expect(emittedData).toMatchObject({
                agent_id: 600,
                error: 'Test error',
            });
        });

        it('should handle missing response gracefully', async () => {
            const deps = createTestACEReflectionDeps();
            const trigger = new ACEReflectionTrigger(deps);

            const result = await trigger.trigger(createReflectionParams({ response: undefined }));

            expect(result.success).toBe(true);
            expect(deps.reflector.analyzeCalls.wasCalled()).toBe(true);
        });

        it('should handle empty tool_calls gracefully', async () => {
            const deps = createTestACEReflectionDeps();
            const trigger = new ACEReflectionTrigger(deps);

            const result = await trigger.trigger(createReflectionParams({ tool_calls: [] }));

            expect(result.success).toBe(true);
            expect(deps.reflector.analyzeCalls.wasCalled()).toBe(true);
        });
    });

    describe('async execution', () => {
        it('should execute reflection pipeline synchronously when called directly', async () => {
            const deps = createTestACEReflectionDeps();
            const trigger = new ACEReflectionTrigger(deps);

            // Direct call is synchronous (for testing)
            const result = await trigger.trigger(createReflectionParams());

            expect(result.reflected).toBe(true);
            expect(result.curated).toBe(true);
        });

        it('should provide triggerAsync for non-blocking execution', () => {
            const deps = createTestACEReflectionDeps();
            const trigger = new ACEReflectionTrigger(deps);

            // triggerAsync returns void immediately
            const params = createReflectionParams();
            expect(() => trigger.triggerAsync(params)).not.toThrow();

            // Reflector should eventually be called (setImmediate)
            // We can't easily test async behavior in unit tests
        });
    });
});

describe('createACEReflectionTrigger', () => {
    it('should create a trigger function', () => {
        const deps = createTestACEReflectionDeps();
        const triggerFn = createACEReflectionTrigger(deps);

        expect(typeof triggerFn).toBe('function');
    });

    it('should return promise when called', async () => {
        const deps = createTestACEReflectionDeps();
        const triggerFn = createACEReflectionTrigger(deps);

        const result = await triggerFn(createReflectionParams());

        expect(result.success).toBe(true);
    });
});
