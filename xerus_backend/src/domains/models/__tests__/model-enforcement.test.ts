// Model Enforcement Tests
// Tests for model validation against DB-backed model_registry.
// Constraint validation removed -- OpenRouter handles per-model limits.

import {
    validateAgentModel,
    validateTeamModels,
    getModelConfig,
    isModelSupported,
    listSupportedModels,
} from '../model-enforcement.service';
import { invalidateCache, listModels } from '../model-registry.service';
import { buildSDKEnvironment } from '../../execution/sdk/sdk.config';
import { ModelEnforcementError } from '../model-enforcement.errors';
import type { AgentModelInput } from '../model-enforcement.types';

function createAgentInput(overrides: Partial<AgentModelInput> = {}): AgentModelInput {
    return {
        id: 1,
        name: 'Test Agent',
        ai_model: 'anthropic/claude-sonnet-4',
        ...overrides,
    };
}

describe('ModelEnforcementService', () => {

    // Clear cache between tests to ensure fresh DB reads
    afterEach(() => {
        invalidateCache();
    });

    // -------------------------------------------------------------------------
    // validateAgentModel - success cases
    // -------------------------------------------------------------------------

    describe('validateAgentModel', () => {
        it('should validate a model that exists in the registry', async () => {
            const agent = createAgentInput({ ai_model: 'anthropic/claude-sonnet-4' });
            const result = await validateAgentModel(agent);

            expect(result.modelId).toBe('anthropic/claude-sonnet-4');
            expect(result.provider).toBe('anthropic');
            expect(result.sdkOptions.model).toBe('anthropic/claude-sonnet-4');
        });

        it('should validate models from different providers', async () => {
            const models = await listModels();
            if (models.length === 0) {
                console.warn('Skipping: model_registry table is empty');
                return;
            }

            const first = models[0];
            const agent = createAgentInput({ ai_model: first.id });
            const result = await validateAgentModel(agent);

            expect(result.modelId).toBe(first.id);
            expect(result.provider).toBe(first.provider);
        });

        // ---------------------------------------------------------------------
        // validateAgentModel - error cases
        // ---------------------------------------------------------------------

        it('should throw MODEL_NOT_CONFIGURED when ai_model is empty', async () => {
            const agent = createAgentInput({ ai_model: '' });
            const error = await validateAgentModel(agent).catch(e => e);

            expect(error).toBeInstanceOf(ModelEnforcementError);
            expect(error.modelErrorCode).toBe('MODEL_NOT_CONFIGURED');
        });

        it('should throw INVALID_MODEL_FORMAT when no slash in model ID', async () => {
            const agent = createAgentInput({ ai_model: 'claude-sonnet-4' });
            const error = await validateAgentModel(agent).catch(e => e);

            expect(error).toBeInstanceOf(ModelEnforcementError);
            expect(error.modelErrorCode).toBe('INVALID_MODEL_FORMAT');
            expect(error.message).toContain('provider/model-name');
        });

        it('should throw UNKNOWN_MODEL for a model not in the registry', async () => {
            const agent = createAgentInput({ ai_model: 'anthropic/claude-nonexistent-999' });
            const error = await validateAgentModel(agent).catch(e => e);

            expect(error).toBeInstanceOf(ModelEnforcementError);
            expect(error.modelErrorCode).toBe('UNKNOWN_MODEL');
        });
    });

    // -------------------------------------------------------------------------
    // validateTeamModels
    // -------------------------------------------------------------------------

    describe('validateTeamModels', () => {
        it('should validate all agents in a team', async () => {
            const models = await listModels();
            if (models.length < 2) {
                console.warn('Skipping: need at least 2 models in registry');
                return;
            }

            const agents = [
                createAgentInput({ id: 1, ai_model: models[0].id }),
                createAgentInput({ id: 2, ai_model: models[1].id }),
            ];

            const validated = await validateTeamModels(agents);

            expect(validated.size).toBe(2);
            expect(validated.get(1)?.modelId).toBe(models[0].id);
            expect(validated.get(2)?.modelId).toBe(models[1].id);
        });

        it('should throw on first invalid agent in team', async () => {
            const agents = [
                createAgentInput({ id: 1, ai_model: 'anthropic/claude-sonnet-4' }),
                createAgentInput({ id: 2, ai_model: 'invalid-format' }),
            ];

            await expect(validateTeamModels(agents)).rejects.toThrow(ModelEnforcementError);
        });

        it('should handle empty team', async () => {
            const validated = await validateTeamModels([]);
            expect(validated.size).toBe(0);
        });
    });

    // -------------------------------------------------------------------------
    // buildSDKEnvironment (imported from sdk.config)
    // -------------------------------------------------------------------------

    describe('buildSDKEnvironment', () => {
        it('should build correct OpenRouter environment', () => {
            const env = buildSDKEnvironment('sk-or-test-123');

            expect(env.ANTHROPIC_BASE_URL).toBe('https://openrouter.ai/api');
            expect(env.ANTHROPIC_AUTH_TOKEN).toBe('sk-or-test-123');
            expect(env.ANTHROPIC_API_KEY).toBe('');
        });

        it('should set ANTHROPIC_API_KEY to empty string', () => {
            const env = buildSDKEnvironment('any-key');
            expect(env.ANTHROPIC_API_KEY).toBe('');
        });
    });

    // -------------------------------------------------------------------------
    // getModelConfig
    // -------------------------------------------------------------------------

    describe('getModelConfig', () => {
        it('should return entry for a model in the registry', async () => {
            const models = await listModels();
            if (models.length === 0) {
                console.warn('Skipping: model_registry table is empty');
                return;
            }

            const entry = await getModelConfig(models[0].id);

            expect(entry.id).toBe(models[0].id);
            expect(entry.provider).toBeTruthy();
            expect(entry.supportsTools).toBe(true);
        });

        it('should throw for unknown model', async () => {
            await expect(getModelConfig('unknown/nonexistent-model')).rejects.toThrow(ModelEnforcementError);
        });
    });

    // -------------------------------------------------------------------------
    // isModelSupported
    // -------------------------------------------------------------------------

    describe('isModelSupported', () => {
        it('should return true for a registered model', async () => {
            const models = await listModels();
            if (models.length === 0) {
                console.warn('Skipping: model_registry table is empty');
                return;
            }
            expect(await isModelSupported(models[0].id)).toBe(true);
        });

        it('should return false for unregistered models', async () => {
            expect(await isModelSupported('fake-provider/fake-model')).toBe(false);
        });
    });

    // -------------------------------------------------------------------------
    // listSupportedModels
    // -------------------------------------------------------------------------

    describe('listSupportedModels', () => {
        it('should return model IDs from the registry', async () => {
            const modelIds = await listSupportedModels();
            const models = await listModels();

            expect(modelIds.length).toBe(models.length);
            for (const m of models) {
                expect(modelIds).toContain(m.id);
            }
        });

        it('should return IDs in provider/model-name format', async () => {
            const modelIds = await listSupportedModels();
            for (const id of modelIds) {
                expect(id).toContain('/');
            }
        });
    });
});
