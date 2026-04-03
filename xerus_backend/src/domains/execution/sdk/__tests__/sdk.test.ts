// Pricing Service Tests (formerly SDK Service Tests)
// Unit tests for pricing configuration, types, credit calculation
// Target: >80% coverage for sdk.service.ts

import {
    SDK_CONFIG,
    buildSDKEnvironment,
} from '../sdk.config';
import {
    PERMISSION_MODE_MAP,
    isSDKSystemMessage,
    isSDKAssistantMessage,
    isSDKToolProgressMessage,
    isSDKResultMessage,
    isSDKStreamEventMessage,
    SDKSystemMessage,
    SDKAssistantMessage,
    SDKToolProgressMessage,
    SDKResultMessage,
    SDKStreamEventMessage,
    ExecuteAgentOptions,
    SDKStreamEvent,
} from '../sdk.types';
import { PricingService } from '../pricing.service';
import { SDKExecutionError } from '../../errors';

// Test DB that returns pricing data matching model_registry
function createTestDb(pricing: Array<{ id: string; pricing_input_cents: string; pricing_output_cents: string }>) {
    return {
        query: async <T>(_sql: string, _params?: unknown[]): Promise<{ rows: T[] }> => {
            return { rows: pricing as unknown as T[] };
        },
    };
}

// Standard pricing matching model_registry table values
const STANDARD_PRICING = [
    { id: 'anthropic/claude-sonnet-4', pricing_input_cents: '3000', pricing_output_cents: '15000' },
    { id: 'anthropic/claude-opus-4', pricing_input_cents: '15000', pricing_output_cents: '75000' },
    { id: 'anthropic/claude-haiku-3.5', pricing_input_cents: '800', pricing_output_cents: '4000' },
    { id: 'openai/gpt-4o', pricing_input_cents: '2500', pricing_output_cents: '10000' },
    { id: 'openai/gpt-4o-mini', pricing_input_cents: '150', pricing_output_cents: '600' },
    { id: 'google/gemini-2.0-flash', pricing_input_cents: '100', pricing_output_cents: '400' },
    { id: 'google/gemini-pro-1.5', pricing_input_cents: '1250', pricing_output_cents: '5000' },
    { id: 'deepseek/deepseek-chat-v3', pricing_input_cents: '270', pricing_output_cents: '1100' },
];

async function createLoadedService(pricing = STANDARD_PRICING): Promise<PricingService> {
    const db = createTestDb(pricing);
    const service = new PricingService(db);
    await service.loadPricing();
    return service;
}

// -----------------------------------------------------------------------------
// SDK Configuration Tests
// -----------------------------------------------------------------------------

describe('SDK_CONFIG', () => {
    it('has correct OpenRouter base URL', () => {
        expect(SDK_CONFIG.openRouterBaseUrl).toBe('https://openrouter.ai/api');
    });

    it('has default model set to Claude Sonnet 4.6', () => {
        expect(SDK_CONFIG.defaultModel).toBe('anthropic/claude-sonnet-4.6');
    });

    it('has reasonable turn and thinking limits', () => {
        expect(SDK_CONFIG.maxTurns).toBe(50);
        expect(SDK_CONFIG.maxThinkingTokens).toBe(10000);
    });

    it('includes essential tools in default allowed tools', () => {
        expect(SDK_CONFIG.defaultAllowedTools).toContain('Read');
        expect(SDK_CONFIG.defaultAllowedTools).toContain('Write');
        expect(SDK_CONFIG.defaultAllowedTools).toContain('Edit');
        expect(SDK_CONFIG.defaultAllowedTools).toContain('Bash');
        expect(SDK_CONFIG.defaultAllowedTools).toContain('Grep');
        expect(SDK_CONFIG.defaultAllowedTools).toContain('Glob');
        expect(SDK_CONFIG.defaultAllowedTools).toContain('Task');
        expect(SDK_CONFIG.defaultAllowedTools).toContain('WebFetch');
        expect(SDK_CONFIG.defaultAllowedTools).toContain('WebSearch');
        expect(SDK_CONFIG.defaultAllowedTools).toContain('TodoWrite');
    });

    it('has 10 default tools', () => {
        expect(SDK_CONFIG.defaultAllowedTools).toHaveLength(10);
    });

    it('has session persistence enabled', () => {
        expect(SDK_CONFIG.persistSession).toBe(true);
    });

    it('has partial messages enabled for streaming', () => {
        expect(SDK_CONFIG.includePartialMessages).toBe(true);
    });

    it('uses bypassPermissions mode', () => {
        expect(SDK_CONFIG.permissionMode).toBe('bypassPermissions');
    });

    it('loads settings from project', () => {
        expect(SDK_CONFIG.settingSources).toContain('project');
    });
});

describe('buildSDKEnvironment', () => {
    it('sets ANTHROPIC_BASE_URL to OpenRouter endpoint', () => {
        const env = buildSDKEnvironment('test-api-key');
        expect(env.ANTHROPIC_BASE_URL).toBe('https://openrouter.ai/api');
    });

    it('sets ANTHROPIC_AUTH_TOKEN to provided API key', () => {
        const env = buildSDKEnvironment('my-api-key-123');
        expect(env.ANTHROPIC_AUTH_TOKEN).toBe('my-api-key-123');
    });

    it('sets ANTHROPIC_API_KEY to empty string (critical for OpenRouter routing)', () => {
        const env = buildSDKEnvironment('test-key');
        expect(env.ANTHROPIC_API_KEY).toBe('');
    });

    it('does not leak process.env variables into sandbox environment', () => {
        const env = buildSDKEnvironment('test-key');
        expect(env.PATH).toBeUndefined();
        expect(Object.keys(env)).toHaveLength(3);
    });
});

// -----------------------------------------------------------------------------
// Permission Mode Map Tests
// -----------------------------------------------------------------------------

describe('PERMISSION_MODE_MAP', () => {
    it('maps supervised to default', () => {
        expect(PERMISSION_MODE_MAP.supervised).toBe('default');
    });

    it('maps semi_autonomous to acceptEdits', () => {
        expect(PERMISSION_MODE_MAP.semi_autonomous).toBe('acceptEdits');
    });

    it('maps autonomous to bypassPermissions', () => {
        expect(PERMISSION_MODE_MAP.autonomous).toBe('bypassPermissions');
    });

    it('has exactly 3 autonomy levels', () => {
        expect(Object.keys(PERMISSION_MODE_MAP)).toHaveLength(3);
    });
});

// -----------------------------------------------------------------------------
// Type Guard Tests
// -----------------------------------------------------------------------------

describe('Type Guards', () => {
    describe('isSDKSystemMessage', () => {
        it('returns true for system init message', () => {
            const msg: SDKSystemMessage = {
                type: 'system',
                subtype: 'init',
                session_id: 'session-123',
            };
            expect(isSDKSystemMessage(msg)).toBe(true);
        });

        it('returns false for assistant message', () => {
            const msg: SDKAssistantMessage = {
                type: 'assistant',
                content: [],
            };
            expect(isSDKSystemMessage(msg)).toBe(false);
        });

        it('returns false for result message', () => {
            const msg: SDKResultMessage = {
                type: 'result',
                subtype: 'success',
                usage: { input_tokens: 100, output_tokens: 200 },
                session_id: 'session-123',
            };
            expect(isSDKSystemMessage(msg)).toBe(false);
        });
    });

    describe('isSDKAssistantMessage', () => {
        it('returns true for assistant message with text', () => {
            const msg: SDKAssistantMessage = {
                type: 'assistant',
                content: [{ type: 'text', text: 'Hello' }],
            };
            expect(isSDKAssistantMessage(msg)).toBe(true);
        });

        it('returns true for assistant message with tool use', () => {
            const msg: SDKAssistantMessage = {
                type: 'assistant',
                content: [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: { path: '/test' } }],
            };
            expect(isSDKAssistantMessage(msg)).toBe(true);
        });

        it('returns true for empty content array', () => {
            const msg: SDKAssistantMessage = {
                type: 'assistant',
                content: [],
            };
            expect(isSDKAssistantMessage(msg)).toBe(true);
        });

        it('returns false for tool progress message', () => {
            const msg: SDKToolProgressMessage = {
                type: 'tool_progress',
                tool_use_id: 'tool-123',
                content: 'Processing...',
            };
            expect(isSDKAssistantMessage(msg)).toBe(false);
        });
    });

    describe('isSDKToolProgressMessage', () => {
        it('returns true for tool progress message', () => {
            const msg: SDKToolProgressMessage = {
                type: 'tool_progress',
                tool_use_id: 'tool-123',
                content: 'Reading file...',
            };
            expect(isSDKToolProgressMessage(msg)).toBe(true);
        });

        it('returns false for system message', () => {
            const msg: SDKSystemMessage = {
                type: 'system',
                subtype: 'init',
                session_id: 'session-123',
            };
            expect(isSDKToolProgressMessage(msg)).toBe(false);
        });
    });

    describe('isSDKResultMessage', () => {
        it('returns true for success result', () => {
            const msg: SDKResultMessage = {
                type: 'result',
                subtype: 'success',
                usage: { input_tokens: 100, output_tokens: 200 },
                session_id: 'session-123',
            };
            expect(isSDKResultMessage(msg)).toBe(true);
        });

        it('returns true for error result', () => {
            const msg: SDKResultMessage = {
                type: 'result',
                subtype: 'error',
                usage: { input_tokens: 50, output_tokens: 0 },
                session_id: 'session-123',
                error: 'Something went wrong',
            };
            expect(isSDKResultMessage(msg)).toBe(true);
        });

        it('returns false for stream event', () => {
            const msg: SDKStreamEventMessage = {
                type: 'stream_event',
                event_type: 'content_delta',
                data: { text: 'partial' },
            };
            expect(isSDKResultMessage(msg)).toBe(false);
        });
    });

    describe('isSDKStreamEventMessage', () => {
        it('returns true for stream event message', () => {
            const msg: SDKStreamEventMessage = {
                type: 'stream_event',
                event_type: 'content_delta',
                data: { text: 'partial' },
            };
            expect(isSDKStreamEventMessage(msg)).toBe(true);
        });

        it('returns false for assistant message', () => {
            const msg: SDKAssistantMessage = {
                type: 'assistant',
                content: [],
            };
            expect(isSDKStreamEventMessage(msg)).toBe(false);
        });
    });
});

// -----------------------------------------------------------------------------
// PricingService Unit Tests
// -----------------------------------------------------------------------------

describe('PricingService', () => {
    let service: PricingService;

    beforeEach(async () => {
        service = await createLoadedService();
    });

    describe('loadPricing', () => {
        it('loads pricing from database', async () => {
            const pricing = service.getModelPricing('anthropic/claude-sonnet-4');
            expect(pricing.input).toBe(3);
            expect(pricing.output).toBe(15);
        });

        it('throws if pricing not loaded', () => {
            const db = createTestDb([]);
            const unloaded = new PricingService(db);
            expect(() => unloaded.getModelPricing('anthropic/claude-sonnet-4')).toThrow(
                'PricingService pricing not loaded'
            );
        });

        it('throws for unknown model', async () => {
            expect(() => service.getModelPricing('unknown/model')).toThrow('Unknown model pricing');
        });

        it('error message includes model name', () => {
            expect(() => service.getModelPricing('my-custom/model-v1')).toThrow('my-custom/model-v1');
        });

        it('error message suggests adding to model_registry', () => {
            expect(() => service.getModelPricing('test/model')).toThrow('model_registry');
        });
    });

    describe('Credit estimation (estimateCredits)', () => {
        it('estimates credits for Claude Sonnet 4', () => {
            const estimate = service.estimateCredits('anthropic/claude-sonnet-4', 1000);
            expect(estimate.model).toBe('anthropic/claude-sonnet-4');
            expect(estimate.estimatedCredits).toBeGreaterThan(0);
            expect(estimate.inputTokenRate).toBe(3);
            expect(estimate.outputTokenRate).toBe(15);
        });

        it('calculates correct credits for 1000 input tokens', () => {
            // 1000 input + 2000 estimated output (2x input)
            // (1000/1000) * 3 + (2000/1000) * 15 = 3 + 30 = 33
            const estimate = service.estimateCredits('anthropic/claude-sonnet-4', 1000);
            expect(estimate.estimatedCredits).toBe(33);
        });

        it('calculates cheaper credits for Haiku', () => {
            // 1000 input + 2000 estimated output
            // (1000/1000) * 0.8 + (2000/1000) * 4 = 0.8 + 8 = 8.8 -> 9
            const estimate = service.estimateCredits('anthropic/claude-haiku-3.5', 1000);
            expect(estimate.estimatedCredits).toBe(9);
        });

        it('calculates expensive credits for Opus', () => {
            // 1000 input + 2000 estimated output
            // (1000/1000) * 15 + (2000/1000) * 75 = 15 + 150 = 165
            const estimate = service.estimateCredits('anthropic/claude-opus-4', 1000);
            expect(estimate.estimatedCredits).toBe(165);
        });

        it('calculates credits for GPT-4o', () => {
            // 1000 input + 2000 estimated output
            // (1000/1000) * 2.5 + (2000/1000) * 10 = 2.5 + 20 = 22.5 -> 23
            const estimate = service.estimateCredits('openai/gpt-4o', 1000);
            expect(estimate.estimatedCredits).toBe(23);
        });

        it('calculates credits for GPT-4o-mini', () => {
            // 1000 input + 2000 estimated output
            // (1000/1000) * 0.15 + (2000/1000) * 0.6 = 0.15 + 1.2 = 1.35 -> 2
            const estimate = service.estimateCredits('openai/gpt-4o-mini', 1000);
            expect(estimate.estimatedCredits).toBe(2);
        });

        it('calculates credits for Gemini 2.0 Flash', () => {
            // 1000 input + 2000 estimated output
            // (1000/1000) * 0.1 + (2000/1000) * 0.4 = 0.1 + 0.8 = 0.9 -> 1
            const estimate = service.estimateCredits('google/gemini-2.0-flash', 1000);
            expect(estimate.estimatedCredits).toBe(1);
        });

        it('calculates credits for DeepSeek Chat V3', () => {
            // 1000 input + 2000 estimated output
            // (1000/1000) * 0.27 + (2000/1000) * 1.1 = 0.27 + 2.2 = 2.47 -> 3
            const estimate = service.estimateCredits('deepseek/deepseek-chat-v3', 1000);
            expect(estimate.estimatedCredits).toBe(3);
        });

        it('throws error for unknown model (fail-fast)', () => {
            expect(() => service.estimateCredits('unknown/model', 1000)).toThrow('Unknown model pricing');
        });

        it('handles zero input tokens', () => {
            const estimate = service.estimateCredits('anthropic/claude-sonnet-4', 0);
            expect(estimate.estimatedCredits).toBe(0);
        });

        it('rounds up to whole credits', () => {
            // 100 input + 200 estimated output for Haiku
            // (100/1000) * 0.8 + (200/1000) * 4 = 0.08 + 0.8 = 0.88 -> 1
            const estimate = service.estimateCredits('anthropic/claude-haiku-3.5', 100);
            expect(estimate.estimatedCredits).toBe(1);
            expect(Number.isInteger(estimate.estimatedCredits)).toBe(true);
        });
    });

    describe('Actual credit calculation (calculateActualCredits)', () => {
        it('calculates credits from actual token usage', () => {
            // (1000/1000) * 3 + (500/1000) * 15 = 3 + 7.5 = 10.5 -> 11
            const credits = service.calculateActualCredits('anthropic/claude-sonnet-4', 1000, 500);
            expect(credits).toBe(11);
        });

        it('calculates zero credits for zero tokens', () => {
            const credits = service.calculateActualCredits('anthropic/claude-sonnet-4', 0, 0);
            expect(credits).toBe(0);
        });

        it('handles large token counts', () => {
            // 100K input + 50K output for Sonnet
            // (100000/1000) * 3 + (50000/1000) * 15 = 300 + 750 = 1050
            const credits = service.calculateActualCredits('anthropic/claude-sonnet-4', 100000, 50000);
            expect(credits).toBe(1050);
        });

        it('handles only input tokens', () => {
            // 1000 input + 0 output
            // (1000/1000) * 3 = 3
            const credits = service.calculateActualCredits('anthropic/claude-sonnet-4', 1000, 0);
            expect(credits).toBe(3);
        });

        it('handles only output tokens', () => {
            // 0 input + 1000 output
            // (1000/1000) * 15 = 15
            const credits = service.calculateActualCredits('anthropic/claude-sonnet-4', 0, 1000);
            expect(credits).toBe(15);
        });

        it('rounds up fractional credits', () => {
            // (1/1000) * 0.8 + (1/1000) * 4 = 0.0008 + 0.004 = 0.0048 -> 1
            const credits = service.calculateActualCredits('anthropic/claude-haiku-3.5', 1, 1);
            expect(credits).toBe(1);
        });

        it('throws error for unknown model (fail-fast)', () => {
            expect(() => service.calculateActualCredits('unknown/model', 1000, 500)).toThrow('Unknown model pricing');
        });
    });

    describe('Model switching support', () => {
        it('supports all Anthropic models', () => {
            const models = ['anthropic/claude-sonnet-4', 'anthropic/claude-opus-4', 'anthropic/claude-haiku-3.5'];
            for (const model of models) {
                const estimate = service.estimateCredits(model, 1000);
                expect(estimate.model).toBe(model);
                expect(estimate.estimatedCredits).toBeGreaterThan(0);
            }
        });

        it('supports all OpenAI models', () => {
            const models = ['openai/gpt-4o', 'openai/gpt-4o-mini'];
            for (const model of models) {
                const estimate = service.estimateCredits(model, 1000);
                expect(estimate.model).toBe(model);
                expect(estimate.estimatedCredits).toBeGreaterThan(0);
            }
        });

        it('supports all Google models', () => {
            const models = ['google/gemini-2.0-flash', 'google/gemini-pro-1.5'];
            for (const model of models) {
                const estimate = service.estimateCredits(model, 1000);
                expect(estimate.model).toBe(model);
                expect(estimate.estimatedCredits).toBeGreaterThan(0);
            }
        });

        it('supports DeepSeek model', () => {
            const estimate = service.estimateCredits('deepseek/deepseek-chat-v3', 1000);
            expect(estimate.model).toBe('deepseek/deepseek-chat-v3');
            expect(estimate.estimatedCredits).toBeGreaterThan(0);
        });
    });

});

// -----------------------------------------------------------------------------
// Type Structure Tests
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Error Handling Tests
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Streaming Response Handling Tests
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Error Handling Scenarios Tests
// -----------------------------------------------------------------------------

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
