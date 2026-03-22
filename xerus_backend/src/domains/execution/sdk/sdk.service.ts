// Claude Agent SDK Service
// Credit estimation utilities for the execution pipeline.
// Pricing loaded from model_registry table (not hardcoded).
// See docs/planning/execution/EXECUTION_ARCHITECTURE_v2.md
//
// Unit convention (1 credit = 1 cent):
//   DB stores pricing_input_cents / pricing_output_cents as cents per 1M tokens.
//   We convert to cents per 1K tokens in the cache so that:
//     credits = (tokens / 1000) * centsPerKToken
//   produces the correct value in cents (= credits).

import { CreditEstimate } from './sdk.types';

interface ModelPricing {
    input: number;  // cents per 1K input tokens
    output: number; // cents per 1K output tokens
}

interface SDKDatabase {
    query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export class SDKService {
    private db: SDKDatabase;
    private pricingCache: Map<string, ModelPricing> | null = null;

    constructor(db: SDKDatabase) {
        this.db = db;
    }

    async loadPricing(): Promise<void> {
        const result = await this.db.query<{
            id: string;
            model_name: string;
            pricing_input_cents: string;
            pricing_output_cents: string;
        }>(
            `SELECT id, model_name, pricing_input_cents, pricing_output_cents
             FROM model_registry
             WHERE is_available = true AND pricing_input_cents IS NOT NULL`,
        );

        const cache = new Map<string, ModelPricing>();
        for (const row of result.rows) {
            // DB: cents per 1M tokens → convert to cents per 1K tokens
            const pricing = {
                input: Number(row.pricing_input_cents) / 1000,
                output: Number(row.pricing_output_cents) / 1000,
            };
            cache.set(row.id, pricing);
            // Also index by model_name so agent configs using short names work
            if (row.model_name && row.model_name !== row.id) {
                cache.set(row.model_name, pricing);
            }
        }
        this.pricingCache = cache;
        console.log(`[SDKService] Loaded pricing for ${cache.size} models from model_registry`);
    }

    getModelPricing(model: string): ModelPricing {
        if (!this.pricingCache) {
            throw new Error('SDKService pricing not loaded. Call loadPricing() at startup.');
        }
        const pricing = this.pricingCache.get(model);
        if (!pricing) {
            throw new Error(
                `Unknown model pricing: ${model}. Add model to model_registry table.`,
            );
        }
        return pricing;
    }

    /** Opus-tier pricing ceiling for conservative credit reservation.
     *  Agents run on Claude SDK, so the worst-case model is always Opus.
     *  DB values: 1500 input / 7500 output cents per 1M tokens
     *  → 1.5 / 7.5 cents per 1K tokens. */
    private static readonly OPUS_CEILING: ModelPricing = {
        input: 1500 / 1000,   // 1.5 cents per 1K tokens
        output: 7500 / 1000,  // 7.5 cents per 1K tokens
    };

    estimateCredits(model: string, estimatedInputTokens: number): CreditEstimate {
        const pricing = this.getModelPricing(model);
        const estimatedOutputTokens = estimatedInputTokens * 2;
        const inputCredits = (estimatedInputTokens / 1000) * pricing.input;
        const outputCredits = (estimatedOutputTokens / 1000) * pricing.output;
        return {
            model,
            estimatedCredits: Math.ceil(inputCredits + outputCredits),
            inputTokenRate: pricing.input,
            outputTokenRate: pricing.output,
        };
    }

    /** Conservative estimate using Opus-tier pricing (worst-case for Claude SDK agents). */
    estimateCreditsConservative(estimatedInputTokens: number): CreditEstimate {
        const pricing = SDKService.OPUS_CEILING;
        const estimatedOutputTokens = estimatedInputTokens * 2;
        const inputCredits = (estimatedInputTokens / 1000) * pricing.input;
        const outputCredits = (estimatedOutputTokens / 1000) * pricing.output;
        return {
            model: 'conservative',
            estimatedCredits: Math.ceil(inputCredits + outputCredits),
            inputTokenRate: pricing.input,
            outputTokenRate: pricing.output,
        };
    }

    calculateActualCredits(model: string, inputTokens: number, outputTokens: number): number {
        const pricing = this.getModelPricing(model);
        return Math.ceil((inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output);
    }
}
