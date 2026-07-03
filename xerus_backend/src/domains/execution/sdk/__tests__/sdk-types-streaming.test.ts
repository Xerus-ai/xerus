// SDK Type Structure and Streaming Tests
// Tests for ExecuteAgentOptions, SDKStreamEvent, SDKExecutionError

import { SDK_CONFIG } from '../sdk.config';
import {
    ExecuteAgentOptions,
    SDKStreamEvent,
} from '../sdk.types';
import { SDKExecutionError } from '../../errors';

describe('ExecuteAgentOptions type', () => {
    it('accepts all required fields', () => {
        const options: ExecuteAgentOptions = {
            agentId: 1,
            agentSlug: 'test-agent',
            userId: 'user-123',
            sandboxId: 'sandbox-123',
            task: 'Do something',
            systemPrompt: 'You are a helpful assistant',
            model: 'anthropic/claude-sonnet-4',
            allowedTools: ['Read', 'Write'],
            workingDirectory: '/workspace',
            apiKey: 'test-key',
        };

        expect(options.agentId).toBe(1);
        expect(options.agentSlug).toBe('test-agent');
        expect(options.userId).toBe('user-123');
        expect(options.sandboxId).toBe('sandbox-123');
        expect(options.task).toBe('Do something');
        expect(options.model).toBe('anthropic/claude-sonnet-4');
    });

    it('accepts optional fields', () => {
        const options: ExecuteAgentOptions = {
            agentId: 1,
            agentSlug: 'test-agent',
            userId: 'user-123',
            sandboxId: 'sandbox-123',
            task: 'Do something',
            systemPrompt: 'You are a helpful assistant',
            model: 'anthropic/claude-sonnet-4',
            allowedTools: [],
            workingDirectory: '/workspace',
            apiKey: 'test-key',
            maxTurns: 10,
            maxTokens: 100000,
            sessionId: 'resume-session-123',
            envVars: { CUSTOM_VAR: 'value' },
        };

        expect(options.maxTurns).toBe(10);
        expect(options.maxTokens).toBe(100000);
        expect(options.sessionId).toBe('resume-session-123');
        expect(options.envVars).toEqual({ CUSTOM_VAR: 'value' });
    });

    it('allows empty allowedTools array', () => {
        const options: ExecuteAgentOptions = {
            agentId: 1,
            agentSlug: 'test-agent',
            userId: 'user-123',
            sandboxId: 'sandbox-123',
            task: 'Do something',
            systemPrompt: 'You are a helpful assistant',
            model: 'anthropic/claude-sonnet-4',
            allowedTools: [],
            workingDirectory: '/workspace',
            apiKey: 'test-key',
        };

        expect(options.allowedTools).toEqual([]);
    });

    it('accepts all default tools', () => {
        const options: ExecuteAgentOptions = {
            agentId: 1,
            agentSlug: 'test-agent',
            userId: 'user-123',
            sandboxId: 'sandbox-123',
            task: 'Do something',
            systemPrompt: 'You are a helpful assistant',
            model: 'anthropic/claude-sonnet-4',
            allowedTools: SDK_CONFIG.defaultAllowedTools,
            workingDirectory: '/workspace',
            apiKey: 'test-key',
        };

        expect(options.allowedTools).toHaveLength(10);
    });
});

describe('SDKStreamEvent type', () => {
    it('supports meta event', () => {
        const event: SDKStreamEvent = {
            type: 'meta',
            executionId: 'exec-123',
            content: {
                model: 'anthropic/claude-sonnet-4',
                agentId: 1,
                agentName: 'test-agent',
                startedAt: '2024-01-01T00:00:00Z',
            },
        };

        expect(event.type).toBe('meta');
        expect(event.executionId).toBe('exec-123');
    });

    it('supports token event', () => {
        const event: SDKStreamEvent = {
            type: 'token',
            executionId: 'exec-123',
            content: { text: 'Hello', tokenCount: 1 },
        };

        expect(event.type).toBe('token');
        expect(event.content).toEqual({ text: 'Hello', tokenCount: 1 });
    });

    it('supports progress event', () => {
        const event: SDKStreamEvent = {
            type: 'progress',
            executionId: 'exec-123',
            content: { phase: 'initialization', message: 'Starting up', percent: 10 },
        };

        expect(event.type).toBe('progress');
    });

    it('supports tool_call event', () => {
        const event: SDKStreamEvent = {
            type: 'tool_call',
            executionId: 'exec-123',
            content: {
                toolName: 'Read',
                arguments: { file_path: '/test.txt' },
                callId: 'call-1',
            },
        };

        expect(event.type).toBe('tool_call');
    });

    it('supports done event with success', () => {
        const event: SDKStreamEvent = {
            type: 'done',
            executionId: 'exec-123',
            content: { success: true },
            meta: {
                sessionId: 'session-456',
                inputTokens: 100,
                outputTokens: 200,
                durationMs: 5000,
            },
        };

        expect(event.type).toBe('done');
        expect(event.meta?.inputTokens).toBe(100);
    });

    it('supports done event with error', () => {
        const event: SDKStreamEvent = {
            type: 'done',
            executionId: 'exec-123',
            content: { success: false, error: 'API rate limited' },
            meta: { errorCode: 'RATE_LIMITED', recoverable: true },
        };

        expect(event.type).toBe('done');
        expect(event.content).toEqual({ success: false, error: 'API rate limited' });
    });

    it('supports cancelled event', () => {
        const event: SDKStreamEvent = {
            type: 'done',
            executionId: 'exec-123',
            content: {
                cancelled: true,
                summary: {
                    totalTokens: 500,
                    durationMs: 2000,
                    toolCalls: 3,
                    agentsUsed: 1,
                },
            },
        };

        expect(event.type).toBe('done');
    });
});

describe('SDKExecutionError', () => {
    it('has descriptive message', () => {
        const error = new SDKExecutionError('Test error message');
        expect(error.message).toContain('SDK execution failed');
        expect(error.message).toContain('Test error message');
    });

    it('preserves original error', () => {
        const originalError = new Error('Original cause');
        const error = new SDKExecutionError('Wrapped error', originalError);
        expect(error.originalError).toBe(originalError);
    });

    it('has correct error code', () => {
        const error = new SDKExecutionError('Test');
        expect((error as { code?: string }).code).toBe('SDK_EXECUTION_FAILED');
    });

    it('works without original error', () => {
        const error = new SDKExecutionError('Standalone error');
        expect(error.originalError).toBeUndefined();
    });
});

describe('Streaming response event mapping', () => {
    it('meta event has required fields', () => {
        const event: SDKStreamEvent = {
            type: 'meta',
            executionId: 'exec-123',
            content: {
                model: 'anthropic/claude-sonnet-4',
                agentId: 1,
                agentName: 'test-agent',
                startedAt: new Date().toISOString(),
            },
        };

        expect(event.type).toBe('meta');
        expect(event.executionId).toBeDefined();
        expect(event.content).toBeDefined();
    });

    it('token event streams partial text', () => {
        const events: SDKStreamEvent[] = [
            { type: 'token', executionId: 'exec-123', content: { text: 'Hello', tokenCount: 1 } },
            { type: 'token', executionId: 'exec-123', content: { text: ' ', tokenCount: 1 } },
            { type: 'token', executionId: 'exec-123', content: { text: 'world', tokenCount: 1 } },
        ];

        const fullText = events
            .filter((e) => e.type === 'token')
            .map((e) => (e.content as { text: string }).text)
            .join('');

        expect(fullText).toBe('Hello world');
    });

    it('tool_call event has tool details', () => {
        const event: SDKStreamEvent = {
            type: 'tool_call',
            executionId: 'exec-123',
            content: {
                toolName: 'Read',
                arguments: { file_path: '/workspace/test.txt' },
                callId: 'call-abc123',
            },
        };

        const content = event.content as { toolName: string; arguments: Record<string, unknown>; callId: string };
        expect(content.toolName).toBe('Read');
        expect(content.arguments.file_path).toBe('/workspace/test.txt');
        expect(content.callId).toBeDefined();
    });

    it('progress event tracks phases', () => {
        const phases = ['initialization', 'tool_result', 'execution', 'completion'];
        const events: SDKStreamEvent[] = phases.map((phase, i) => ({
            type: 'progress',
            executionId: 'exec-123',
            content: { phase, message: `Phase: ${phase}`, percent: (i + 1) * 25 },
        }));

        expect(events).toHaveLength(4);
        expect((events[0].content as { percent: number }).percent).toBe(25);
        expect((events[3].content as { percent: number }).percent).toBe(100);
    });

    it('done event includes summary', () => {
        const event: SDKStreamEvent = {
            type: 'done',
            executionId: 'exec-123',
            content: {
                success: true,
                summary: {
                    totalTokens: 1500,
                    durationMs: 10000,
                    toolCalls: 5,
                    agentsUsed: 1,
                },
            },
            meta: {
                sessionId: 'session-456',
                inputTokens: 500,
                outputTokens: 1000,
            },
        };

        const content = event.content as { success: boolean; summary: { totalTokens: number } };
        expect(content.success).toBe(true);
        expect(content.summary.totalTokens).toBe(1500);
        expect(event.meta?.sessionId).toBe('session-456');
    });
});

describe('API failure error handling', () => {
    it('SDKExecutionError wraps API errors', () => {
        const apiError = new Error('401 Unauthorized: Invalid API key');
        const error = new SDKExecutionError('API authentication failed', apiError);

        expect(error.message).toContain('SDK execution failed');
        expect(error.message).toContain('API authentication failed');
        expect(error.originalError?.message).toContain('401 Unauthorized');
    });

    it('SDKExecutionError wraps rate limit errors', () => {
        const rateLimitError = new Error('429 Too Many Requests');
        const error = new SDKExecutionError('Rate limited by provider', rateLimitError);

        expect(error.message).toContain('Rate limited');
        expect(error.originalError?.message).toContain('429');
    });

    it('SDKExecutionError wraps timeout errors', () => {
        const timeoutError = new Error('Request timeout after 60000ms');
        const error = new SDKExecutionError('Execution timed out', timeoutError);

        expect(error.message).toContain('timed out');
    });

    it('SDKExecutionError wraps model unavailable errors', () => {
        const modelError = new Error('Model anthropic/claude-opus-4 is currently unavailable');
        const error = new SDKExecutionError('Model unavailable', modelError);

        expect(error.message).toContain('Model unavailable');
    });
});
