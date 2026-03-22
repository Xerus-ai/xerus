// Tools Domain Validators
// Joi schemas for all tool-related input validation

import Joi from 'joi';
import { ToolValidationError } from './errors';
import type {
    SaveConnectionInput,
    LogExecutionInput,
    ListAppsInput,
    ListAppsFromDBInput,
    StartConnectionInput,
    GetConnectedAccountsInput,
    DisconnectAccountInput,
    ListActionsInput,
    GetActionInput,
    ExecuteActionInput,
    GetActionOptionsInput,
} from './types';

// ===== SCHEMAS =====

const saveConnectionSchema = Joi.object({
    user_id: Joi.string().required(),
    pipedream_account_id: Joi.string().required(),
    app_slug: Joi.string().required(),
    app_name: Joi.string().required(),
});

const logExecutionSchema = Joi.object({
    agent_id: Joi.number().integer().positive().allow(null).required(),
    app_slug: Joi.string().required(),
    action_key: Joi.string().required(),
    input: Joi.object().required(),
    output: Joi.object().allow(null).optional(),
    success: Joi.boolean().required(),
    error: Joi.string().allow(null, '').optional(),
    duration_ms: Joi.number().integer().min(0).required(),
});

const listAppsSchema = Joi.object({
    query: Joi.string().min(1).max(100).optional(),
});

const listAppsFromDBSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().min(1).max(100).optional(),
    categories: Joi.array().items(Joi.string().min(1).max(50)).optional(),
});

const startConnectionSchema = Joi.object({
    user_id: Joi.string().required(),
    webhook_url: Joi.string().uri().optional(),
    allowed_origins: Joi.array().items(Joi.string()).optional(),
});

const getConnectedAccountsSchema = Joi.object({
    user_id: Joi.string().required(),
    app_slug: Joi.string().optional(),
});

const disconnectAccountSchema = Joi.object({
    pipedream_account_id: Joi.string().required(),
    user_id: Joi.string().required(),
});

const listActionsSchema = Joi.object({
    app_slug: Joi.string().required(),
    query: Joi.string().min(1).max(100).optional(),
    limit: Joi.number().integer().min(1).max(100).default(50),
});

const getActionSchema = Joi.object({
    action_key: Joi.string().required(),
});

const executeActionSchema = Joi.object({
    user_id: Joi.string().required(),
    action_key: Joi.string().required(),
    pipedream_account_id: Joi.string().required(),
    params: Joi.object().required(),
});

const getActionOptionsSchema = Joi.object({
    user_id: Joi.string().required(),
    action_key: Joi.string().required(),
    prop_name: Joi.string().required(),
    configured_props: Joi.object().required(),
});

// ===== VALIDATOR CLASS =====

export class ToolValidator {
    validateSaveConnection(data: unknown): SaveConnectionInput {
        const { error, value } = saveConnectionSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new ToolValidationError(errors);
        }

        return value;
    }

    validateLogExecution(data: unknown): LogExecutionInput {
        const { error, value } = logExecutionSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new ToolValidationError(errors);
        }

        return value;
    }

    validateListApps(data: unknown): ListAppsInput {
        const { error, value } = listAppsSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new ToolValidationError(errors);
        }

        return value;
    }

    validateListAppsFromDB(data: unknown): ListAppsFromDBInput {
        const { error, value } = listAppsFromDBSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new ToolValidationError(errors);
        }

        return value;
    }

    validateStartConnection(data: unknown): StartConnectionInput {
        const { error, value } = startConnectionSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new ToolValidationError(errors);
        }

        return value;
    }

    validateGetConnectedAccounts(data: unknown): GetConnectedAccountsInput {
        const { error, value } = getConnectedAccountsSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new ToolValidationError(errors);
        }

        return value;
    }

    validateDisconnectAccount(data: unknown): DisconnectAccountInput {
        const { error, value } = disconnectAccountSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new ToolValidationError(errors);
        }

        return value;
    }

    validateListActions(data: unknown): ListActionsInput {
        const { error, value } = listActionsSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new ToolValidationError(errors);
        }

        return value;
    }

    validateGetAction(data: unknown): GetActionInput {
        const { error, value } = getActionSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new ToolValidationError(errors);
        }

        return value;
    }

    validateExecuteAction(data: unknown): ExecuteActionInput {
        const { error, value } = executeActionSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new ToolValidationError(errors);
        }

        return value;
    }

    validateGetActionOptions(data: unknown): GetActionOptionsInput {
        const { error, value } = getActionOptionsSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message,
            }));
            throw new ToolValidationError(errors);
        }

        return value;
    }
}

export const toolValidator = new ToolValidator();
