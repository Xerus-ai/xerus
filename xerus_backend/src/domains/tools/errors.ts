// Tools Domain Errors
// Custom error classes for tool-related failures

import { AppError } from '../../utils/errors';

export class ToolError extends AppError {
    constructor(message: string, statusCode: number, code: string) {
        super(message, statusCode, code);
    }
}

export class ToolNotConnectedError extends ToolError {
    public readonly app_slug: string;
    public readonly user_id: string;

    constructor(app_slug: string, user_id: string) {
        super(`User ${user_id} has not connected ${app_slug}`, 400, 'TOOL_NOT_CONNECTED');
        this.app_slug = app_slug;
        this.user_id = user_id;
    }
}

export class ToolExecutionError extends ToolError {
    public readonly action_key: string;
    public readonly original_error: Error;

    constructor(action_key: string, original_error: Error) {
        super(`Failed to execute ${action_key}: ${original_error.message}`, 500, 'TOOL_EXECUTION_FAILED');
        this.action_key = action_key;
        this.original_error = original_error;
    }
}

export class UnauthorizedAccessError extends ToolError {
    public readonly resource: string;
    public readonly user_id: string;

    constructor(resource: string, user_id: string, message?: string) {
        super(message || `User ${user_id} does not have permission to access ${resource}`, 403, 'UNAUTHORIZED_ACCESS');
        this.resource = resource;
        this.user_id = user_id;
    }
}

export class ToolValidationError extends ToolError {
    public readonly errors: { field: string; message: string }[];

    constructor(errors: { field: string; message: string }[]) {
        const message = errors.map(e => `${e.field}: ${e.message}`).join(', ');
        super(`Validation failed: ${message}`, 422, 'TOOL_VALIDATION_ERROR');
        this.errors = errors;
    }
}
