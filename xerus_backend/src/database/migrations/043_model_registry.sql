-- Migration 043: Model Registry
-- Stores available AI models from OpenRouter catalog.
-- Replaces static MODEL_REGISTRY constant in model-enforcement.types.ts.
-- Data populated from claude_agents.model_registry (same Neon project).

CREATE TABLE IF NOT EXISTS model_registry (
    id VARCHAR(255) PRIMARY KEY,                    -- OpenRouter model ID (e.g., 'anthropic/claude-sonnet-4')
    provider VARCHAR(100) NOT NULL,                 -- Provider slug (e.g., 'anthropic', 'openai')
    model_name VARCHAR(255) NOT NULL,               -- Model name without provider prefix
    display_name VARCHAR(255) NOT NULL,             -- Human-readable display name
    description TEXT,                               -- Optional model description
    context_length INTEGER,                         -- Max context window in tokens
    supports_vision BOOLEAN NOT NULL DEFAULT false,
    supports_tools BOOLEAN NOT NULL DEFAULT true,
    supports_thinking BOOLEAN NOT NULL DEFAULT false,
    tier VARCHAR(50),                               -- 'frontier', 'advanced', 'fast'
    is_available BOOLEAN NOT NULL DEFAULT true,
    is_deprecated BOOLEAN NOT NULL DEFAULT false,
    is_featured BOOLEAN NOT NULL DEFAULT false,      -- Curated models shown in frontend selector
    pricing_input_cents BIGINT,                     -- Cost per 1M input tokens in cents
    pricing_output_cents BIGINT,                    -- Cost per 1M output tokens in cents
    tags JSONB NOT NULL DEFAULT '{}',
    openrouter_metadata JSONB NOT NULL DEFAULT '{}',
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_model_registry_provider ON model_registry(provider);
CREATE INDEX IF NOT EXISTS idx_model_registry_available ON model_registry(is_available, is_deprecated) WHERE is_available = true AND is_deprecated = false;
CREATE INDEX IF NOT EXISTS idx_model_registry_tier ON model_registry(tier);
CREATE INDEX IF NOT EXISTS idx_model_registry_featured ON model_registry(is_featured) WHERE is_featured = true;
