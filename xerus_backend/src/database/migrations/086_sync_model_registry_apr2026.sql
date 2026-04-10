-- Migration 086: Sync model registry with OpenRouter (April 2026)
-- Adds new tool-capable models, updates featured flags to latest versions.

-- ============================================================================
-- 1. INSERT new models (ON CONFLICT DO NOTHING to avoid dupes)
-- ============================================================================

-- Anthropic
INSERT INTO model_registry (id, provider, model_name, display_name, context_length, supports_vision, supports_tools, supports_thinking, tier, is_available, is_deprecated, is_featured, pricing_input_cents, pricing_output_cents)
VALUES
    ('anthropic/claude-opus-4.6-fast', 'anthropic', 'claude-opus-4.6-fast', 'Anthropic: Claude Opus 4.6 Fast', 1000000, true, true, true, 'frontier', true, false, true, 3000, 15000)
ON CONFLICT (id) DO UPDATE SET is_available = true, is_deprecated = false, display_name = EXCLUDED.display_name, context_length = EXCLUDED.context_length, pricing_input_cents = EXCLUDED.pricing_input_cents, pricing_output_cents = EXCLUDED.pricing_output_cents, updated_at = NOW();

-- OpenAI new models
INSERT INTO model_registry (id, provider, model_name, display_name, context_length, supports_vision, supports_tools, supports_thinking, tier, is_available, is_deprecated, is_featured, pricing_input_cents, pricing_output_cents)
VALUES
    ('openai/gpt-5.4-pro', 'openai', 'gpt-5.4-pro', 'OpenAI: GPT-5.4 Pro', 1050000, true, true, true, 'frontier', true, false, true, 3000000, 18000000),
    ('openai/gpt-5.4', 'openai', 'gpt-5.4', 'OpenAI: GPT-5.4', 1050000, true, true, true, 'frontier', true, false, true, 250000, 1500000),
    ('openai/gpt-5.4-mini', 'openai', 'gpt-5.4-mini', 'OpenAI: GPT-5.4 Mini', 400000, true, true, true, 'fast', true, false, false, 75000, 450000),
    ('openai/gpt-5.4-nano', 'openai', 'gpt-5.4-nano', 'OpenAI: GPT-5.4 Nano', 400000, true, true, false, 'fast', true, false, false, 20000, 125000),
    ('openai/gpt-5.3-codex', 'openai', 'gpt-5.3-codex', 'OpenAI: GPT-5.3 Codex', 400000, true, true, true, 'frontier', true, false, true, 175000, 1400000),
    ('openai/gpt-5.2', 'openai', 'gpt-5.2', 'OpenAI: GPT-5.2', 400000, true, true, true, 'frontier', true, false, false, 175000, 1400000),
    ('openai/gpt-5.2-codex', 'openai', 'gpt-5.2-codex', 'OpenAI: GPT-5.2 Codex', 400000, true, true, true, 'frontier', true, false, false, 175000, 1400000),
    ('openai/gpt-audio', 'openai', 'gpt-audio', 'OpenAI: GPT Audio', 128000, false, true, false, 'advanced', true, false, false, 250000, 1000000),
    ('openai/gpt-audio-mini', 'openai', 'gpt-audio-mini', 'OpenAI: GPT Audio Mini', 128000, false, true, false, 'fast', true, false, false, 60000, 240000)
ON CONFLICT (id) DO UPDATE SET is_available = true, is_deprecated = false, display_name = EXCLUDED.display_name, context_length = EXCLUDED.context_length, pricing_input_cents = EXCLUDED.pricing_input_cents, pricing_output_cents = EXCLUDED.pricing_output_cents, updated_at = NOW();

-- Google new models
INSERT INTO model_registry (id, provider, model_name, display_name, context_length, supports_vision, supports_tools, supports_thinking, tier, is_available, is_deprecated, is_featured, pricing_input_cents, pricing_output_cents)
VALUES
    ('google/gemini-3.1-pro-preview', 'google', 'gemini-3.1-pro-preview', 'Google: Gemini 3.1 Pro Preview', 1048000, true, true, true, 'frontier', true, false, true, 200000, 1200000),
    ('google/gemini-3.1-flash-lite-preview', 'google', 'gemini-3.1-flash-lite-preview', 'Google: Gemini 3.1 Flash Lite Preview', 1048000, true, true, false, 'fast', true, false, false, 25000, 150000),
    ('google/gemma-4-26b-a4b-it', 'google', 'gemma-4-26b-a4b-it', 'Google: Gemma 4 26B A4B', 262000, true, true, false, 'fast', true, false, false, 12000, 40000),
    ('google/gemma-4-31b-it', 'google', 'gemma-4-31b-it', 'Google: Gemma 4 31B', 262000, true, true, false, 'fast', true, false, false, 14000, 40000)
ON CONFLICT (id) DO UPDATE SET is_available = true, is_deprecated = false, display_name = EXCLUDED.display_name, context_length = EXCLUDED.context_length, pricing_input_cents = EXCLUDED.pricing_input_cents, pricing_output_cents = EXCLUDED.pricing_output_cents, updated_at = NOW();

-- xAI (Grok)
INSERT INTO model_registry (id, provider, model_name, display_name, context_length, supports_vision, supports_tools, supports_thinking, tier, is_available, is_deprecated, is_featured, pricing_input_cents, pricing_output_cents)
VALUES
    ('x-ai/grok-4.20', 'x-ai', 'grok-4.20', 'xAI: Grok 4.20', 2000000, true, true, true, 'frontier', true, false, true, 200000, 600000),
    ('x-ai/grok-4.20-multi-agent', 'x-ai', 'grok-4.20-multi-agent', 'xAI: Grok 4.20 Multi-Agent', 2000000, true, true, true, 'frontier', true, false, false, 200000, 600000)
ON CONFLICT (id) DO UPDATE SET is_available = true, is_deprecated = false, display_name = EXCLUDED.display_name, context_length = EXCLUDED.context_length, pricing_input_cents = EXCLUDED.pricing_input_cents, pricing_output_cents = EXCLUDED.pricing_output_cents, updated_at = NOW();

-- Z.AI (GLM) new versions
INSERT INTO model_registry (id, provider, model_name, display_name, context_length, supports_vision, supports_tools, supports_thinking, tier, is_available, is_deprecated, is_featured, pricing_input_cents, pricing_output_cents)
VALUES
    ('z-ai/glm-5.1', 'z-ai', 'glm-5.1', 'Z.AI: GLM 5.1', 202700, false, true, true, 'advanced', true, false, true, 139500, 440000),
    ('z-ai/glm-5', 'z-ai', 'glm-5', 'Z.AI: GLM 5', 80000, false, true, true, 'advanced', true, false, false, 72000, 230000),
    ('z-ai/glm-5-turbo', 'z-ai', 'glm-5-turbo', 'Z.AI: GLM 5 Turbo', 202700, false, true, true, 'fast', true, false, false, 120000, 400000),
    ('z-ai/glm-5v-turbo', 'z-ai', 'glm-5v-turbo', 'Z.AI: GLM 5V Turbo', 202700, true, true, true, 'fast', true, false, false, 120000, 400000),
    ('z-ai/glm-4.7-flash', 'z-ai', 'glm-4.7-flash', 'Z.AI: GLM 4.7 Flash', 202700, false, true, false, 'fast', true, false, false, 6000, 40000)
ON CONFLICT (id) DO UPDATE SET is_available = true, is_deprecated = false, display_name = EXCLUDED.display_name, context_length = EXCLUDED.context_length, pricing_input_cents = EXCLUDED.pricing_input_cents, pricing_output_cents = EXCLUDED.pricing_output_cents, updated_at = NOW();

-- MoonshotAI (Kimi)
INSERT INTO model_registry (id, provider, model_name, display_name, context_length, supports_vision, supports_tools, supports_thinking, tier, is_available, is_deprecated, is_featured, pricing_input_cents, pricing_output_cents)
VALUES
    ('moonshotai/kimi-k2.5', 'moonshotai', 'kimi-k2.5', 'MoonshotAI: Kimi K2.5', 262000, true, true, true, 'advanced', true, false, true, 38000, 172000)
ON CONFLICT (id) DO UPDATE SET is_available = true, is_deprecated = false, display_name = EXCLUDED.display_name, context_length = EXCLUDED.context_length, pricing_input_cents = EXCLUDED.pricing_input_cents, pricing_output_cents = EXCLUDED.pricing_output_cents, updated_at = NOW();

-- MiniMax
INSERT INTO model_registry (id, provider, model_name, display_name, context_length, supports_vision, supports_tools, supports_thinking, tier, is_available, is_deprecated, is_featured, pricing_input_cents, pricing_output_cents)
VALUES
    ('minimax/minimax-m2.7', 'minimax', 'minimax-m2.7', 'MiniMax: MiniMax M2.7', 204800, false, true, true, 'advanced', true, false, true, 30000, 120000),
    ('minimax/minimax-m2.5', 'minimax', 'minimax-m2.5', 'MiniMax: MiniMax M2.5', 196600, false, true, true, 'fast', true, false, false, 11800, 99000),
    ('minimax/minimax-m2.5:free', 'minimax', 'minimax-m2.5:free', 'MiniMax: MiniMax M2.5 (free)', 196600, false, true, true, 'fast', true, false, false, 0, 0)
ON CONFLICT (id) DO UPDATE SET is_available = true, is_deprecated = false, display_name = EXCLUDED.display_name, context_length = EXCLUDED.context_length, pricing_input_cents = EXCLUDED.pricing_input_cents, pricing_output_cents = EXCLUDED.pricing_output_cents, updated_at = NOW();

-- Qwen new models
INSERT INTO model_registry (id, provider, model_name, display_name, context_length, supports_vision, supports_tools, supports_thinking, tier, is_available, is_deprecated, is_featured, pricing_input_cents, pricing_output_cents)
VALUES
    ('qwen/qwen3.6-plus', 'qwen', 'qwen3.6-plus', 'Qwen: Qwen3.6 Plus', 1000000, true, true, true, 'advanced', true, false, true, 32500, 195000),
    ('qwen/qwen3.5-plus-02-15', 'qwen', 'qwen3.5-plus-02-15', 'Qwen: Qwen3.5 Plus', 1000000, true, true, true, 'advanced', true, false, false, 26000, 156000),
    ('qwen/qwen3.5-397b-a17b', 'qwen', 'qwen3.5-397b-a17b', 'Qwen: Qwen3.5 397B A17B', 262000, true, true, true, 'advanced', true, false, false, 39000, 234000),
    ('qwen/qwen3.5-122b-a10b', 'qwen', 'qwen3.5-122b-a10b', 'Qwen: Qwen3.5 122B A10B', 262000, true, true, true, 'fast', true, false, false, 26000, 208000),
    ('qwen/qwen3.5-35b-a3b', 'qwen', 'qwen3.5-35b-a3b', 'Qwen: Qwen3.5 35B A3B', 262000, true, true, true, 'fast', true, false, false, 16250, 130000),
    ('qwen/qwen3.5-27b', 'qwen', 'qwen3.5-27b', 'Qwen: Qwen3.5 27B', 262000, true, true, true, 'fast', true, false, false, 19500, 156000),
    ('qwen/qwen3.5-9b', 'qwen', 'qwen3.5-9b', 'Qwen: Qwen3.5 9B', 256000, true, true, false, 'fast', true, false, false, 5000, 15000),
    ('qwen/qwen3.5-flash-02-23', 'qwen', 'qwen3.5-flash-02-23', 'Qwen: Qwen3.5 Flash', 1000000, true, true, false, 'fast', true, false, false, 6500, 26000),
    ('qwen/qwen3-max-thinking', 'qwen', 'qwen3-max-thinking', 'Qwen: Qwen3 Max (thinking)', 262000, false, true, true, 'advanced', true, false, false, 78000, 390000),
    ('qwen/qwen3-coder-next', 'qwen', 'qwen3-coder-next', 'Qwen: Qwen3 Coder Next', 262000, false, true, true, 'advanced', true, false, false, 12000, 75000)
ON CONFLICT (id) DO UPDATE SET is_available = true, is_deprecated = false, display_name = EXCLUDED.display_name, context_length = EXCLUDED.context_length, pricing_input_cents = EXCLUDED.pricing_input_cents, pricing_output_cents = EXCLUDED.pricing_output_cents, updated_at = NOW();

-- Mistral
INSERT INTO model_registry (id, provider, model_name, display_name, context_length, supports_vision, supports_tools, supports_thinking, tier, is_available, is_deprecated, is_featured, pricing_input_cents, pricing_output_cents)
VALUES
    ('mistralai/mistral-small-2603', 'mistralai', 'mistral-small-2603', 'Mistral: Mistral Small 2603', 262000, true, true, false, 'fast', true, false, true, 15000, 60000)
ON CONFLICT (id) DO UPDATE SET is_available = true, is_deprecated = false, display_name = EXCLUDED.display_name, context_length = EXCLUDED.context_length, pricing_input_cents = EXCLUDED.pricing_input_cents, pricing_output_cents = EXCLUDED.pricing_output_cents, updated_at = NOW();

-- ByteDance Seed
INSERT INTO model_registry (id, provider, model_name, display_name, context_length, supports_vision, supports_tools, supports_thinking, tier, is_available, is_deprecated, is_featured, pricing_input_cents, pricing_output_cents)
VALUES
    ('bytedance-seed/seed-2.0-lite', 'bytedance-seed', 'seed-2.0-lite', 'ByteDance: Seed 2.0 Lite', 262000, true, true, false, 'fast', true, false, false, 25000, 200000),
    ('bytedance-seed/seed-2.0-mini', 'bytedance-seed', 'seed-2.0-mini', 'ByteDance: Seed 2.0 Mini', 262000, true, true, false, 'fast', true, false, false, 10000, 40000)
ON CONFLICT (id) DO UPDATE SET is_available = true, is_deprecated = false, display_name = EXCLUDED.display_name, context_length = EXCLUDED.context_length, pricing_input_cents = EXCLUDED.pricing_input_cents, pricing_output_cents = EXCLUDED.pricing_output_cents, updated_at = NOW();

-- Xiaomi MiMo
INSERT INTO model_registry (id, provider, model_name, display_name, context_length, supports_vision, supports_tools, supports_thinking, tier, is_available, is_deprecated, is_featured, pricing_input_cents, pricing_output_cents)
VALUES
    ('xiaomi/mimo-v2-omni', 'xiaomi', 'mimo-v2-omni', 'Xiaomi: MiMo V2 Omni', 262000, true, true, false, 'fast', true, false, false, 40000, 200000),
    ('xiaomi/mimo-v2-pro', 'xiaomi', 'mimo-v2-pro', 'Xiaomi: MiMo V2 Pro', 1048000, false, true, true, 'advanced', true, false, false, 100000, 300000)
ON CONFLICT (id) DO UPDATE SET is_available = true, is_deprecated = false, display_name = EXCLUDED.display_name, context_length = EXCLUDED.context_length, pricing_input_cents = EXCLUDED.pricing_input_cents, pricing_output_cents = EXCLUDED.pricing_output_cents, updated_at = NOW();

-- Upstage
INSERT INTO model_registry (id, provider, model_name, display_name, context_length, supports_vision, supports_tools, supports_thinking, tier, is_available, is_deprecated, is_featured, pricing_input_cents, pricing_output_cents)
VALUES
    ('upstage/solar-pro-3', 'upstage', 'solar-pro-3', 'Upstage: Solar Pro 3', 128000, false, true, false, 'fast', true, false, false, 15000, 60000)
ON CONFLICT (id) DO UPDATE SET is_available = true, is_deprecated = false, display_name = EXCLUDED.display_name, context_length = EXCLUDED.context_length, pricing_input_cents = EXCLUDED.pricing_input_cents, pricing_output_cents = EXCLUDED.pricing_output_cents, updated_at = NOW();

-- KwaiPilot
INSERT INTO model_registry (id, provider, model_name, display_name, context_length, supports_vision, supports_tools, supports_thinking, tier, is_available, is_deprecated, is_featured, pricing_input_cents, pricing_output_cents)
VALUES
    ('kwaipilot/kat-coder-pro-v2', 'kwaipilot', 'kat-coder-pro-v2', 'KwaiPilot: KAT-Coder Pro V2', 256000, false, true, false, 'fast', true, false, false, 30000, 120000)
ON CONFLICT (id) DO UPDATE SET is_available = true, is_deprecated = false, display_name = EXCLUDED.display_name, context_length = EXCLUDED.context_length, pricing_input_cents = EXCLUDED.pricing_input_cents, pricing_output_cents = EXCLUDED.pricing_output_cents, updated_at = NOW();

-- Arcee AI
INSERT INTO model_registry (id, provider, model_name, display_name, context_length, supports_vision, supports_tools, supports_thinking, tier, is_available, is_deprecated, is_featured, pricing_input_cents, pricing_output_cents)
VALUES
    ('arcee-ai/trinity-large-thinking', 'arcee-ai', 'trinity-large-thinking', 'Arcee AI: Trinity Large (thinking)', 262000, false, true, true, 'fast', true, false, false, 22000, 85000)
ON CONFLICT (id) DO UPDATE SET is_available = true, is_deprecated = false, display_name = EXCLUDED.display_name, context_length = EXCLUDED.context_length, pricing_input_cents = EXCLUDED.pricing_input_cents, pricing_output_cents = EXCLUDED.pricing_output_cents, updated_at = NOW();

-- ============================================================================
-- 2. UPDATE featured flags - demote older versions, promote latest
-- ============================================================================

-- Demote older Anthropic models from featured
UPDATE model_registry SET is_featured = false, updated_at = NOW()
WHERE id IN ('anthropic/claude-opus-4', 'anthropic/claude-sonnet-4');

-- Demote older OpenAI models from featured
UPDATE model_registry SET is_featured = false, updated_at = NOW()
WHERE id IN ('openai/gpt-5.1-codex', 'openai/gpt-5.1-codex-max', 'openai/gpt-5.2-pro');

-- Demote older Google models from featured
UPDATE model_registry SET is_featured = false, updated_at = NOW()
WHERE id IN ('google/gemini-2.5-flash', 'google/gemini-2.5-pro');

-- Demote older Qwen from featured
UPDATE model_registry SET is_featured = false, updated_at = NOW()
WHERE id IN ('qwen/qwen3-coder-plus');

-- Demote older Kimi from featured
UPDATE model_registry SET is_featured = false, updated_at = NOW()
WHERE id IN ('moonshotai/kimi-k2');

-- Demote older Z.AI from featured
UPDATE model_registry SET is_featured = false, updated_at = NOW()
WHERE id IN ('z-ai/glm-4.7');

-- Keep deepseek/deepseek-v3.2 as featured (still latest)

-- ============================================================================
-- 3. Ensure new featured flags are set (in case ON CONFLICT didn't set them)
-- ============================================================================

UPDATE model_registry SET is_featured = true, updated_at = NOW()
WHERE id IN (
    -- Anthropic (latest)
    'anthropic/claude-opus-4-6', 'anthropic/claude-sonnet-4-6', 'anthropic/claude-opus-4.6-fast',
    -- OpenAI (latest + contenders)
    'openai/gpt-5.4-pro', 'openai/gpt-5.4', 'openai/gpt-5.4-mini', 'openai/gpt-5.4-nano',
    'openai/gpt-5.3-codex', 'openai/gpt-5.2', 'openai/gpt-5.2-codex',
    -- Google (latest + contenders)
    'google/gemini-3.1-pro-preview', 'google/gemini-3.1-flash-lite-preview',
    'google/gemma-4-26b-a4b-it', 'google/gemma-4-31b-it',
    -- DeepSeek (latest)
    'deepseek/deepseek-v3.2',
    -- xAI
    'x-ai/grok-4.20', 'x-ai/grok-4.20-multi-agent',
    -- Z.AI (all new)
    'z-ai/glm-5.1', 'z-ai/glm-5', 'z-ai/glm-5-turbo', 'z-ai/glm-5v-turbo', 'z-ai/glm-4.7-flash',
    -- MoonshotAI
    'moonshotai/kimi-k2.5',
    -- MiniMax
    'minimax/minimax-m2.7', 'minimax/minimax-m2.5',
    -- Qwen (all new)
    'qwen/qwen3.6-plus', 'qwen/qwen3.5-plus-02-15', 'qwen/qwen3.5-397b-a17b',
    'qwen/qwen3.5-122b-a10b', 'qwen/qwen3.5-35b-a3b', 'qwen/qwen3.5-27b',
    'qwen/qwen3.5-9b', 'qwen/qwen3.5-flash-02-23',
    'qwen/qwen3-max-thinking', 'qwen/qwen3-coder-next',
    -- Mistral
    'mistralai/mistral-small-2603',
    -- ByteDance
    'bytedance-seed/seed-2.0-lite', 'bytedance-seed/seed-2.0-mini',
    -- Xiaomi
    'xiaomi/mimo-v2-pro', 'xiaomi/mimo-v2-omni',
    -- Others
    'arcee-ai/trinity-large-thinking', 'upstage/solar-pro-3', 'kwaipilot/kat-coder-pro-v2'
);

-- Update last_synced_at for all touched rows
UPDATE model_registry SET last_synced_at = NOW() WHERE updated_at > NOW() - INTERVAL '1 minute';
