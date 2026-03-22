// Model Enforcement Types
// Validation types for model routing via OpenRouter.
// Model data now lives in DB (model_registry table) via model-registry.service.ts.

// -----------------------------------------------------------------------------
// Model Error Codes
// -----------------------------------------------------------------------------

export type ModelErrorCode =
    | 'MODEL_NOT_CONFIGURED'
    | 'INVALID_MODEL_FORMAT'
    | 'UNKNOWN_MODEL';

// -----------------------------------------------------------------------------
// Validated Model Result
// Returned by validateAgentModel() on success.
// -----------------------------------------------------------------------------

export interface ValidatedModel {
    modelId: string;
    provider: string;
    sdkOptions: {
        model: string;
    };
}

// -----------------------------------------------------------------------------
// Agent Model Input
// Minimal agent context needed for model validation.
// Uses only the fields we actually need from Agent/AgentContext.
// -----------------------------------------------------------------------------

export interface AgentModelInput {
    id: number;
    name: string;
    ai_model: string;
}
