// Execution mapping utility: thinking tokens, CoT prompts, and permission modes
// Reference: docs/planning/execution/behaviour-config.md

// Import types and constants from canonical source
import {
    ThinkingLevel,
    AutonomyLevel,
    PermissionMode,
    THINKING_TOKENS,
    COT_PROMPTS,
    PERMISSION_MAP,
} from '../types';

// Re-export for convenience
export { ThinkingLevel, AutonomyLevel, PermissionMode, THINKING_TOKENS, COT_PROMPTS, PERMISSION_MAP };

export interface ThinkingConfig {
    maxThinkingTokens?: number;
    systemPrompt?: string;
}

// -----------------------------------------------------------------------------
// Functions
// -----------------------------------------------------------------------------

/**
 * Check if a model ID is a Claude model
 * Handles both direct model IDs and provider-prefixed formats (e.g., anthropic/claude-3)
 */
export function isClaudeModel(modelId: string): boolean {
    const normalized = modelId.toLowerCase();
    return normalized.includes('claude') || normalized.startsWith('anthropic/');
}

/**
 * Resolve thinking configuration based on thinking level and model
 *
 * For Claude models: Returns maxThinkingTokens for SDK extended thinking
 * For non-Claude models: Returns CoT prompt suffix for systemPrompt
 *
 * @param thinkingLevel - The agent's thinking level setting
 * @param modelId - The model ID being used
 * @returns ThinkingConfig with either maxThinkingTokens or systemPrompt suffix
 */
export function resolveThinkingConfig(
    thinkingLevel: ThinkingLevel,
    modelId: string
): ThinkingConfig {
    if (isClaudeModel(modelId)) {
        return {
            maxThinkingTokens: THINKING_TOKENS[thinkingLevel],
        };
    }

    const cotPrompt = COT_PROMPTS[thinkingLevel];
    if (!cotPrompt) {
        return {};
    }

    return {
        systemPrompt: `\n\n## Reasoning\n${cotPrompt}`,
    };
}

/**
 * Map autonomy level to SDK permissionMode
 *
 * @param autonomyLevel - The agent's autonomy level setting
 * @returns SDK permissionMode string
 */
export function resolvePermissionMode(autonomyLevel: AutonomyLevel): PermissionMode {
    return PERMISSION_MAP[autonomyLevel];
}
