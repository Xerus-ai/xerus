// Skills Domain Validators
import Joi from 'joi';
import {
    CreateSkillDTO,
    UpdateSkillDTO,
    InstallSkillDTO,
    SkillListOptions,
    SKILL_CATEGORIES,
    SKILL_SLUG_PATTERN,
    SKILL_SLUG_MAX_LENGTH,
    VALID_SORT_FIELDS,
} from './types';
import { SkillValidationError } from './errors';

const slugSchema = Joi.string()
    .pattern(SKILL_SLUG_PATTERN)
    .max(SKILL_SLUG_MAX_LENGTH)
    .messages({
        'string.pattern.base': 'Slug must contain only lowercase letters, numbers, and hyphens',
        'string.max': `Slug must be at most ${SKILL_SLUG_MAX_LENGTH} characters`,
    });

const createSkillSchema = Joi.object({
    name: Joi.string().min(1).max(255).required(),
    slug: slugSchema.optional(),
    description: Joi.string().max(5000).allow('').default(''),
    category: Joi.string().valid(...SKILL_CATEGORIES).optional(),
    tags: Joi.array().items(Joi.string().max(50)).max(20).default([]),
    is_global: Joi.boolean().default(false),
    is_published: Joi.boolean().default(false),
    author: Joi.string().max(255).allow(null, '').optional(),
    source_url: Joi.string().uri().max(500).allow(null, '').optional(),
    avatar_config: Joi.string().max(100).allow(null, '').optional(),
});

const updateSkillSchema = Joi.object({
    name: Joi.string().min(1).max(255).optional(),
    description: Joi.string().max(5000).allow('').optional(),
    category: Joi.string().valid(...SKILL_CATEGORIES).allow(null).optional(),
    tags: Joi.array().items(Joi.string().max(50)).max(20).optional(),
    is_published: Joi.boolean().optional(),
    author: Joi.string().max(255).allow(null, '').optional(),
    source_url: Joi.string().uri().max(500).allow(null, '').optional(),
    version: Joi.string().pattern(/^\d+\.\d+\.\d+$/).optional(),
    avatar_config: Joi.string().max(100).allow(null, '').optional(),
}).min(1);

const installSkillSchema = Joi.object({
    scope: Joi.string().valid('channel', 'global').required(),
    channel_id: Joi.string().max(255).when('scope', {
        is: 'channel',
        then: Joi.optional(),
        otherwise: Joi.forbidden(),
    }),
});

const filterSchema = Joi.object({
    category: Joi.string().valid(...SKILL_CATEGORIES).optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    search: Joi.string().max(255).optional(),
    is_published: Joi.boolean().optional(),
    is_global: Joi.boolean().optional(),
});

const listOptionsSchema = Joi.object({
    filters: filterSchema.optional(),
    sort_by: Joi.string().valid(...VALID_SORT_FIELDS).default('created_at'),
    sort_order: Joi.string().valid('asc', 'desc').default('desc'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
});

const PROTECTED_FIELDS = ['user_id', 'created_at', 'updated_at'];

export class SkillValidator {
    validateCreate(data: unknown): CreateSkillDTO {
        const { error, value } = createSkillSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });
        if (error) {
            throw new SkillValidationError(
                error.details.map(d => ({ field: d.path.join('.'), message: d.message })),
            );
        }
        return value as CreateSkillDTO;
    }

    validateUpdate(data: unknown): UpdateSkillDTO {
        this.checkProtectedFields(data as Record<string, unknown>);
        const { error, value } = updateSkillSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });
        if (error) {
            throw new SkillValidationError(
                error.details.map(d => ({ field: d.path.join('.'), message: d.message })),
            );
        }
        return value as UpdateSkillDTO;
    }

    validateInstall(data: unknown): InstallSkillDTO {
        const { error, value } = installSkillSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });
        if (error) {
            throw new SkillValidationError(
                error.details.map(d => ({ field: d.path.join('.'), message: d.message })),
            );
        }
        return value as InstallSkillDTO;
    }

    validateListOptions(options: unknown): SkillListOptions {
        const { error, value } = listOptionsSchema.validate(options, {
            abortEarly: false,
            stripUnknown: true,
        });
        if (error) {
            throw new SkillValidationError(
                error.details.map(d => ({ field: d.path.join('.'), message: d.message })),
            );
        }
        return value as SkillListOptions;
    }

    private checkProtectedFields(data: Record<string, unknown>): void {
        if (!data || typeof data !== 'object') return;
        for (const field of PROTECTED_FIELDS) {
            if (field in data) {
                throw new SkillValidationError([{
                    field,
                    message: `Cannot update protected field: ${field}`,
                }]);
            }
        }
    }
}

export const skillValidator = new SkillValidator();
