// Agent Domain Validators
// Simplified - system_prompt is now a markdown string
import Joi from 'joi';
import {
    CreateAgentDTO,
    UpdateAgentDTO,
    Agent,
    AgentFilters,
    AgentListOptions,
    DEFAULT_MODEL,
} from './types';
import { AgentValidationError, InvalidModelError, ProtectedFieldError, PublishRequirementsError } from './errors';
import { isModelAvailable } from '../models/model-registry.service';
import {
    THINKING_LEVELS,
    AUTONOMY_LEVELS,
    DEFAULT_THINKING_LEVEL,
    DEFAULT_AUTONOMY_LEVEL,
} from '../execution/types';

const publicMetadataSchema = Joi.object({
    description: Joi.string().min(50).max(500).required(),
    changelog: Joi.string().max(1000).optional(),
    version: Joi.string()
        .pattern(/^\d+\.\d+\.\d+$/)
        .optional(),
    category: Joi.string().valid('marketing', 'data', 'content', 'research', 'sales', 'support').optional(),
    use_cases: Joi.array().items(Joi.string()).optional(),
});

// Behaviour configuration schemas (from behaviour-config.md)
const thinkingLevelSchema = Joi.string().valid(...THINKING_LEVELS);
const autonomyLevelSchema = Joi.string().valid(...AUTONOMY_LEVELS);

// Create Agent Schema - system_prompt, capabilities, workflow_config live in workspace files
const mascotPattern = /^mascot:[cp]\d+-\d+-\d+-\d+-\d+$/;

const createAgentSchema = Joi.object({
    name: Joi.string().min(1).max(255).required(),
    description: Joi.string().max(2000).allow('').default(''),
    personality_type: Joi.string().max(100).allow(null, '').optional(),
    system_prompt: Joi.string().allow('').optional(),
    avatar_url: Joi.string().pattern(mascotPattern).allow(null, '').optional(),
    ai_model: Joi.string().max(100).default(DEFAULT_MODEL),
    tags: Joi.array().items(Joi.string().max(50)).max(20).default([]),
    public_metadata: publicMetadataSchema.allow(null).optional(),
    thinking_level: thinkingLevelSchema.default(DEFAULT_THINKING_LEVEL),
    autonomy_level: autonomyLevelSchema.default(DEFAULT_AUTONOMY_LEVEL),
});

// Update Agent Schema
const updateAgentSchema = Joi.object({
    name: Joi.string().min(1).max(255).optional(),
    description: Joi.string().max(2000).allow('').optional(),
    personality_type: Joi.string().max(100).allow(null, '').optional(),
    system_prompt: Joi.string().allow('').optional(),
    avatar_url: Joi.string().pattern(mascotPattern).allow(null, '').optional(),
    ai_model: Joi.string().max(50).optional(),
    agent_type: Joi.string().valid('public', 'private').optional(),
    tags: Joi.array().items(Joi.string().max(50)).max(20).optional(),
    public_metadata: publicMetadataSchema.allow(null).optional(),
    is_default: Joi.boolean().optional(),
    thinking_level: thinkingLevelSchema.optional(),
    autonomy_level: autonomyLevelSchema.optional(),
}).min(1);

// Filter Schema
const filterSchema = Joi.object({
    agent_type: Joi.string().valid('internal', 'public', 'private').optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    is_verified: Joi.boolean().optional(),
    ai_model: Joi.string().optional(),
    search: Joi.string().max(255).optional(),
});

// List Options Schema
const listOptionsSchema = Joi.object({
    filters: filterSchema.optional(),
    sort_by: Joi.string().valid('name', 'created_at', 'updated_at', 'last_used_at', 'execution_count', 'clone_count').default('created_at'),
    sort_order: Joi.string().valid('asc', 'desc').default('desc'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
});

// Protected fields that cannot be updated
const PROTECTED_FIELDS = ['id', 'user_id', 'source_agent_id', 'clone_count', 'execution_count', 'success_rate', 'created_at', 'is_verified'];

// Validator Class
export class AgentValidator {
    validateCreate(data: unknown): CreateAgentDTO {
        const { error, value } = createAgentSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new AgentValidationError(errors);
        }

        return value as CreateAgentDTO;
    }

    validateUpdate(data: unknown): UpdateAgentDTO {
        const { error, value } = updateAgentSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new AgentValidationError(errors);
        }

        // Check for protected fields
        this.checkProtectedFields(value);

        return value as UpdateAgentDTO;
    }

    validateListOptions(options: unknown): AgentListOptions {
        const { error, value } = listOptionsSchema.validate(options, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new AgentValidationError(errors);
        }

        return value as AgentListOptions;
    }

    validateFilters(filters: unknown): AgentFilters {
        const { error, value } = filterSchema.validate(filters, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new AgentValidationError(errors);
        }

        return value as AgentFilters;
    }

    async validateModel(model: string): Promise<void> {
        const parts = model.split('/');

        // Accept OpenRouter format: provider/model-name
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
            throw new InvalidModelError(`Model must be in provider/model format: ${model}`);
        }

        // Validate against DB model registry
        const available = await isModelAvailable(model);
        if (!available) {
            throw new InvalidModelError(`Model '${model}' is not available in the model registry`);
        }
    }

    validatePublishRequirements(agent: Agent): void {
        const errors: string[] = [];

        // 1. execution_count >= 10
        // 2. execution_count >= 10
        const executionCount = Number(agent.execution_count) || 0;
        if (executionCount < 10) {
            errors.push(`execution_count must be >= 10 (current: ${executionCount})`);
        }

        // 3. success_rate >= 0.80
        const successRate = Number(agent.success_rate) || 0;
        if (successRate < 0.8) {
            errors.push(`success_rate must be >= 0.80 (current: ${successRate.toFixed(4)})`);
        }

        // 4. public_metadata.description required
        if (!agent.public_metadata?.description) {
            errors.push('public_metadata.description is required for publishing');
        }

        // 5. At least 1 tag
        if (!agent.tags || agent.tags.length === 0) {
            errors.push('At least 1 tag is required for publishing');
        }

        if (errors.length > 0) {
            throw new PublishRequirementsError(errors);
        }
    }

    private checkProtectedFields(data: Record<string, unknown>): void {
        for (const field of PROTECTED_FIELDS) {
            if (field in data) {
                throw new ProtectedFieldError(field);
            }
        }
    }

}

// Singleton export
export const agentValidator = new AgentValidator();
