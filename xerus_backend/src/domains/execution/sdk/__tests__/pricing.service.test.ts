// PricingService Unit Tests
// Credit estimation and actual credit calculation

import { PricingService } from '../pricing.service';

function createTestDb(pricing: Array<{ id: string; pricing_input_cents: string; pricing_output_cents: string }>) {
    return {
        query: async <T>(_sql: string, _params?: unknown[]): Promise<{ rows: T[] }> => {
            return { rows: pricing as unknown as T[] };
        },
    };
}

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
            const estimate = service.estimateCredits('anthropic/claude-sonnet-4', 1000);
            expect(estimate.estimatedCredits).toBe(33);
        });

        it('calculates cheaper credits for Haiku', () => {
            const estimate = service.estimateCredits('anthropic/claude-haiku-3.5', 1000);
            expect(estimate.estimatedCredits).toBe(9);
        });

        it('calculates expensive credits for Opus', () => {
            const estimate = service.estimateCredits('anthropic/claude-opus-4', 1000);
            expect(estimate.estimatedCredits).toBe(165);
        });

        it('calculates credits for GPT-4o', () => {
            const estimate = service.estimateCredits('openai/gpt-4o', 1000);
            expect(estimate.estimatedCredits).toBe(23);
        });

        it('calculates credits for GPT-4o-mini', () => {
            const estimate = service.estimateCredits('openai/gpt-4o-mini', 1000);
            expect(estimate.estimatedCredits).toBe(2);
        });

        it('calculates credits for Gemini 2.0 Flash', () => {
            const estimate = service.estimateCredits('google/gemini-2.0-flash', 1000);
            expect(estimate.estimatedCredits).toBe(1);
        });

        it('calculates credits for DeepSeek Chat V3', () => {
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
            const estimate = service.estimateCredits('anthropic/claude-haiku-3.5', 100);
            expect(estimate.estimatedCredits).toBe(1);
            expect(Number.isInteger(estimate.estimatedCredits)).toBe(true);
        });
    });

    describe('Actual credit calculation (calculateActualCredits)', () => {
        it('calculates credits from actual token usage', () => {
            const credits = service.calculateActualCredits('anthropic/claude-sonnet-4', 1000, 500);
            expect(credits).toBe(11);
        });

        it('calculates zero credits for zero tokens', () => {
            const credits = service.calculateActualCredits('anthropic/claude-sonnet-4', 0, 0);
            expect(credits).toBe(0);
        });

        it('handles large token counts', () => {
            const credits = service.calculateActualCredits('anthropic/claude-sonnet-4', 100000, 50000);
            expect(credits).toBe(1050);
        });

        it('handles only input tokens', () => {
            const credits = service.calculateActualCredits('anthropic/claude-sonnet-4', 1000, 0);
            expect(credits).toBe(3);
        });

        it('handles only output tokens', () => {
            const credits = service.calculateActualCredits('anthropic/claude-sonnet-4', 0, 1000);
            expect(credits).toBe(15);
        });

        it('rounds up fractional credits', () => {
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
