// Users Domain Validators
// Joi schemas for all user-related input validation

import Joi from 'joi';
import { VALID_API_PROVIDERS } from './types';
import { UserValidationError } from './errors';
import type { UserCreateInput, UserUpdateInput, CreditDeductInput, ApiKeySetInput, CreditHistoryOptions } from './types';

// ===== SCHEMAS =====

const findOrCreateSchema = Joi.object({
    firebase_uid: Joi.string().required(),
    email: Joi.string().email().required(),
    display_name: Joi.string().min(1).max(255).allow(null, '').optional(),
    avatar_url: Joi.string().uri().allow(null, '').optional(),
});

const updateUserSchema = Joi.object({
    display_name: Joi.string().min(1).max(255).allow(null, ''),
    avatar_url: Joi.string().uri().allow(null, ''),
    timezone: Joi.string().max(50).allow(null, ''),
}).min(1);

const creditDeductSchema = Joi.object({
    amount: Joi.number().integer().positive().default(1),
    description: Joi.string().max(500).optional(),
    reference_id: Joi.string().max(255).optional(),
    reference_type: Joi.string().max(50).optional(),
});

const apiKeySetSchema = Joi.object({
    provider: Joi.string()
        .valid(...VALID_API_PROVIDERS)
        .required(),
    api_key: Joi.string().min(10).max(500).required(),
});

const creditHistoryOptionsSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    operation: Joi.string().valid('deduct', 'reset', 'add', 'refund').optional(),
    start_date: Joi.date().iso().optional(),
    end_date: Joi.date().iso().optional(),
});

// ===== VALIDATOR CLASS =====

export class UserValidator {
    validateFindOrCreate(data: unknown): UserCreateInput {
        const { error, value } = findOrCreateSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new UserValidationError(errors);
        }

        return value;
    }

    validateUpdate(data: unknown): UserUpdateInput {
        const { error, value } = updateUserSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new UserValidationError(errors);
        }

        return value;
    }

    validateCreditDeduct(data: unknown): CreditDeductInput {
        const { error, value } = creditDeductSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new UserValidationError(errors);
        }

        return value;
    }

    validateApiKeySet(data: unknown): ApiKeySetInput {
        const { error, value } = apiKeySetSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new UserValidationError(errors);
        }

        return value;
    }

    validateCreditHistoryOptions(data: unknown): CreditHistoryOptions {
        const { error, value } = creditHistoryOptionsSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new UserValidationError(errors);
        }

        return value;
    }

    validateApiProvider(provider: string): void {
        if (!VALID_API_PROVIDERS.includes(provider as any)) {
            throw new UserValidationError([
                {
                    field: 'provider',
                    message: `Invalid provider. Must be one of: ${VALID_API_PROVIDERS.join(', ')}`,
                },
            ]);
        }
    }
}

// Singleton export
export const userValidator = new UserValidator();
