// Invite Codes Domain Validators
// Joi schemas for invite code input validation

import Joi from 'joi';
import { InviteCodeValidationError } from './errors';
import type { GenerateCodesInput } from './types';

// ===== SCHEMAS =====

// Code format: 8 uppercase alphanumeric chars (ambiguity-free charset)
const redeemSchema = Joi.object({
    code: Joi.string()
        .pattern(/^[A-Z2-9]{8}$/)
        .required()
        .messages({
            'string.pattern.base': 'Code must be 8 uppercase alphanumeric characters',
        }),
});

const generateSchema = Joi.object({
    count: Joi.number().integer().min(1).max(100).required(),
    expires_at: Joi.date().iso().min('now').allow(null).optional(),
});

// ===== VALIDATOR CLASS =====

export class InviteCodeValidator {
    validateRedeem(data: unknown): { code: string } {
        const { error, value } = redeemSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new InviteCodeValidationError(errors);
        }

        return value as { code: string };
    }

    validateGenerate(data: unknown): GenerateCodesInput {
        const { error, value } = generateSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new InviteCodeValidationError(errors);
        }

        return value as GenerateCodesInput;
    }
}

// Singleton export
export const inviteCodeValidator = new InviteCodeValidator();
