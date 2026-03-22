// SDK Integration Tests
// Credit calculation, SDK configuration tests
// executeAgent tests removed: execution now flows through v2 pipeline
// (ExecutionService -> runner inside sandbox), not SDKService.executeAgent()
// Run with: npm test -- --testPathPattern="sdk.integration"

import {
    SDK_CONFIG,
    buildSDKEnvironment,
} from '../sdk.config';
import { SDKService } from '../sdk.service';

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

async function createLoadedService(pricing = STANDARD_PRICING): Promise<SDKService> {
    const db = createTestDb(pricing);
    const service = new SDKService(db);
    await service.loadPricing();
    return service;
}

// -----------------------------------------------------------------------------
// Credit Calculation Tests
// -----------------------------------------------------------------------------

describe('SDKService Credit Calculation', () => {
    let service: SDKService;

    beforeEach(async () => {
        service = await createLoadedService();
    });

    describe('estimateCredits', () => {
        it('calculates correct estimate for Claude Sonnet 4', () => {
            const estimate = service.estimateCredits('anthropic/claude-sonnet-4', 1000);

            expect(estimate.model).toBe('anthropic/claude-sonnet-4');
            expect(estimate.estimatedCredits).toBe(33);
            expect(estimate.inputTokenRate).toBe(3);
            expect(estimate.outputTokenRate).toBe(15);
        });

        it('calculates correct estimate for Claude Opus 4', () => {
            const estimate = service.estimateCredits('anthropic/claude-opus-4', 1000);

            expect(estimate.estimatedCredits).toBe(165);
            expect(estimate.inputTokenRate).toBe(15);
            expect(estimate.outputTokenRate).toBe(75);
        });

        it('calculates correct estimate for GPT-4o', () => {
            const estimate = service.estimateCredits('openai/gpt-4o', 1000);

            expect(estimate.estimatedCredits).toBe(23);
            expect(estimate.inputTokenRate).toBe(2.5);
            expect(estimate.outputTokenRate).toBe(10);
        });

        it('calculates correct estimate for Claude Haiku 3.5', () => {
            const estimate = service.estimateCredits('anthropic/claude-haiku-3.5', 1000);

            expect(estimate.estimatedCredits).toBe(9);
            expect(estimate.inputTokenRate).toBe(0.8);
            expect(estimate.outputTokenRate).toBe(4);
        });

        it('calculates correct estimate for Gemini 2.0 Flash', () => {
            const estimate = service.estimateCredits('google/gemini-2.0-flash', 1000);

            expect(estimate.estimatedCredits).toBe(1);
            expect(estimate.inputTokenRate).toBe(0.1);
            expect(estimate.outputTokenRate).toBe(0.4);
        });

        it('calculates correct estimate for DeepSeek Chat V3', () => {
            const estimate = service.estimateCredits('deepseek/deepseek-chat-v3', 1000);

            expect(estimate.estimatedCredits).toBe(3);
            expect(estimate.inputTokenRate).toBe(0.27);
            expect(estimate.outputTokenRate).toBe(1.1);
        });

        it('scales correctly with larger input', () => {
            const estimate = service.estimateCredits('anthropic/claude-sonnet-4', 10000);

            expect(estimate.estimatedCredits).toBe(330);
        });

        it('throws error for unknown model (fail-fast)', () => {
            expect(() => service.estimateCredits('unknown/model', 1000)).toThrow('Unknown model pricing');
        });
    });

    describe('calculateActualCredits', () => {
        it('calculates actual credits from token usage', () => {
            const credits = service.calculateActualCredits('anthropic/claude-sonnet-4', 1000, 500);

            expect(credits).toBe(11);
        });

        it('calculates zero credits for zero tokens', () => {
            const credits = service.calculateActualCredits('anthropic/claude-sonnet-4', 0, 0);
            expect(credits).toBe(0);
        });

        it('calculates credits for high token counts', () => {
            const credits = service.calculateActualCredits('anthropic/claude-sonnet-4', 100000, 50000);

            expect(credits).toBe(1050);
        });

        it('handles fractional credits with ceiling', () => {
            const credits = service.calculateActualCredits('anthropic/claude-sonnet-4', 100, 50);
            // (100/1000)*3 + (50/1000)*15 = 0.3 + 0.75 = 1.05 -> ceil = 2
            expect(credits).toBe(2);
        });

        it('throws error for unknown model (fail-fast)', () => {
            expect(() => service.calculateActualCredits('unknown/model', 1000, 500)).toThrow(
                'Unknown model pricing'
            );
        });
    });

    describe('all loaded models have valid pricing', () => {
        it('all models have positive input and output rates', () => {
            const models = STANDARD_PRICING.map(p => p.id);

            for (const model of models) {
                const pricing = service.getModelPricing(model);
                expect(pricing.input).toBeGreaterThan(0);
                expect(pricing.output).toBeGreaterThan(0);
                expect(pricing.output).toBeGreaterThanOrEqual(pricing.input);
            }
        });
    });
});

// -----------------------------------------------------------------------------
// SDK Configuration Tests
// -----------------------------------------------------------------------------

describe('SDK Configuration', () => {
    describe('buildSDKEnvironment', () => {
        it('configures OpenRouter routing correctly', () => {
            const env = buildSDKEnvironment('or-api-key-123');

            expect(env.ANTHROPIC_BASE_URL).toBe('https://openrouter.ai/api');
            expect(env.ANTHROPIC_AUTH_TOKEN).toBe('or-api-key-123');
            expect(env.ANTHROPIC_API_KEY).toBe('');
        });

        it('returns only whitelisted env vars (no process.env leakage)', () => {
            const env = buildSDKEnvironment('test-key');
            const keys = Object.keys(env);

            expect(keys).toHaveLength(3);
            expect(keys).toContain('ANTHROPIC_BASE_URL');
            expect(keys).toContain('ANTHROPIC_AUTH_TOKEN');
            expect(keys).toContain('ANTHROPIC_API_KEY');
        });
    });

    describe('SDK_CONFIG defaults', () => {
        it('has sensible default values', () => {
            expect(SDK_CONFIG.openRouterBaseUrl).toBe('https://openrouter.ai/api');
            expect(SDK_CONFIG.defaultModel).toBe('anthropic/claude-sonnet-4.6');
            expect(SDK_CONFIG.maxTurns).toBeGreaterThan(0);
            expect(SDK_CONFIG.maxThinkingTokens).toBeGreaterThan(0);
            expect(SDK_CONFIG.defaultAllowedTools.length).toBeGreaterThan(0);
            expect(SDK_CONFIG.persistSession).toBe(true);
            expect(SDK_CONFIG.includePartialMessages).toBe(true);
        });

        it('includes essential tools', () => {
            const essentialTools = ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'];

            for (const tool of essentialTools) {
                expect(SDK_CONFIG.defaultAllowedTools).toContain(tool);
            }
        });
    });
});
