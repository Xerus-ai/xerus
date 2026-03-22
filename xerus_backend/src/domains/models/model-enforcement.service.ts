// Model Enforcement Service (v2 - DB-Backed)
// Validates agent models against model_registry table.
// Constraint validation removed — OpenRouter handles per-model limits.
// See docs/planning/execution/model-enforcement.md

import { getModel, listModels, isModelAvailable, type ModelEntry } from './model-registry.service';
import { ModelEnforcementError } from './model-enforcement.errors';
import type { ValidatedModel, AgentModelInput } from './model-enforcement.types';

// Re-export for convenience
export type { ModelEntry };

// -----------------------------------------------------------------------------
// Model Validation
// Runs BEFORE SDK query(). An invalid model never reaches the SDK.
// Validates: format (provider/model-name), existence in registry.
// Constraint validation (temperature, top_p, max_tokens) removed —
// OpenRouter validates per-model limits and returns proper errors.
// -----------------------------------------------------------------------------

export async function validateAgentModel(agent: AgentModelInput): Promise<ValidatedModel> {
    const modelId = agent.ai_model;

    if (!modelId) {
        throw new ModelEnforcementError(
            'MODEL_NOT_CONFIGURED',
            `Agent ${agent.id} ("${agent.name}") has no model configured`,
        );
    }

    if (!modelId.includes('/')) {
        throw new ModelEnforcementError(
            'INVALID_MODEL_FORMAT',
            `Model ID must be "provider/model-name" format. Got: "${modelId}"`,
        );
    }

    const entry = await getModel(modelId);
    if (!entry) {
        throw new ModelEnforcementError(
            'UNKNOWN_MODEL',
            `Model "${modelId}" is not in the registry`,
        );
    }

    const [provider] = modelId.split('/');

    return {
        modelId,
        provider,
        sdkOptions: {
            model: modelId,
        },
    };
}

// -----------------------------------------------------------------------------
// Team Model Validation
// Validates ALL agent models before starting team execution.
// One failure stops the entire team.
// -----------------------------------------------------------------------------

export async function validateTeamModels(
    teamAgents: AgentModelInput[],
): Promise<Map<number, ValidatedModel>> {
    const results = await Promise.all(
        teamAgents.map(async agent => [agent.id, await validateAgentModel(agent)] as const),
    );
    return new Map(results);
}

// -----------------------------------------------------------------------------
// Model Registry Lookup
// Expose registry lookup for other services that need model metadata.
// -----------------------------------------------------------------------------

export async function getModelConfig(modelId: string): Promise<ModelEntry> {
    const entry = await getModel(modelId);
    if (!entry) {
        throw new ModelEnforcementError(
            'UNKNOWN_MODEL',
            `Model "${modelId}" is not in the registry`,
        );
    }
    return entry;
}

// Canonical name: isModelSupported (delegates to registry's isModelAvailable)
export { isModelAvailable as isModelSupported };

export async function listSupportedModels(): Promise<string[]> {
    const models = await listModels();
    return models.map(m => m.id);
}
