// Model Registry Service
// Queries model_registry table with 5-min TTL in-memory cache.
// Replaces static MODEL_REGISTRY constant.

import { query } from '../../database/connection';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ModelRegistryRow {
    id: string;
    provider: string;
    model_name: string;
    display_name: string;
    description: string | null;
    context_length: number | null;
    supports_vision: boolean;
    supports_tools: boolean;
    supports_thinking: boolean;
    tier: string | null;
    is_available: boolean;
    is_deprecated: boolean;
    is_featured: boolean;
    pricing_input_cents: string | null;
    pricing_output_cents: string | null;
}

export interface ModelEntry {
    id: string;
    provider: string;
    modelName: string;
    displayName: string;
    description: string | null;
    contextLength: number | null;
    supportsVision: boolean;
    supportsTools: boolean;
    supportsThinking: boolean;
    tier: string | null;
    isFeatured: boolean;
    pricingInputCents: number | null;
    pricingOutputCents: number | null;
}

// -----------------------------------------------------------------------------
// Cache
// -----------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedModels: Map<string, ModelEntry> | null = null;
let cacheTimestamp = 0;
let inflightLoad: Promise<Map<string, ModelEntry>> | null = null;

function mapRow(row: ModelRegistryRow): ModelEntry {
    return {
        id: row.id,
        provider: row.provider,
        modelName: row.model_name,
        displayName: row.display_name,
        description: row.description,
        contextLength: row.context_length,
        supportsVision: row.supports_vision,
        supportsTools: row.supports_tools,
        supportsThinking: row.supports_thinking,
        tier: row.tier,
        isFeatured: row.is_featured,
        pricingInputCents: row.pricing_input_cents ? Number(row.pricing_input_cents) : null,
        pricingOutputCents: row.pricing_output_cents ? Number(row.pricing_output_cents) : null,
    };
}

async function loadModels(): Promise<Map<string, ModelEntry>> {
    const now = Date.now();
    if (cachedModels && now - cacheTimestamp < CACHE_TTL_MS) {
        return cachedModels;
    }

    if (inflightLoad) {
        return inflightLoad;
    }

    inflightLoad = query<ModelRegistryRow>(
        `SELECT id, provider, model_name, display_name, description, context_length,
                supports_vision, supports_tools, supports_thinking, tier,
                is_available, is_deprecated, is_featured,
                pricing_input_cents, pricing_output_cents
         FROM model_registry
         WHERE is_available = true AND is_deprecated = false AND supports_tools = true
         ORDER BY provider, model_name`,
    ).then(result => {
        const models = new Map<string, ModelEntry>();
        for (const row of result.rows) {
            models.set(row.id, mapRow(row));
        }
        cachedModels = models;
        cacheTimestamp = Date.now();
        inflightLoad = null;
        return models;
    }).catch(err => {
        inflightLoad = null;
        throw err;
    });

    return inflightLoad;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export async function getModel(modelId: string): Promise<ModelEntry | null> {
    const models = await loadModels();
    return models.get(modelId) || null;
}

export async function listModels(): Promise<ModelEntry[]> {
    const models = await loadModels();
    return Array.from(models.values());
}

export async function listFeaturedModels(): Promise<ModelEntry[]> {
    const models = await loadModels();
    return Array.from(models.values()).filter(m => m.isFeatured);
}

export async function isModelAvailable(modelId: string): Promise<boolean> {
    const models = await loadModels();
    return models.has(modelId);
}

export function invalidateCache(): void {
    cachedModels = null;
    cacheTimestamp = 0;
    inflightLoad = null;
}
