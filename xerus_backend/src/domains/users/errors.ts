// Users Domain Error Classes
import { AppError } from '../../utils/errors';

export class UserError extends AppError {
    constructor(message: string, statusCode: number, code: string) {
        super(message, statusCode, code);
    }
}

export class UserNotFoundError extends UserError {
    constructor(identifier?: string) {
        super(identifier ? `User not found: ${identifier}` : 'User not found', 404, 'USER_NOT_FOUND');
    }
}

export class UserAlreadyExistsError extends UserError {
    constructor(email: string) {
        super(`User with email ${email} already exists`, 409, 'USER_ALREADY_EXISTS');
    }
}

export class UserUnauthorizedError extends UserError {
    constructor(message = 'Authentication required') {
        super(message, 401, 'USER_UNAUTHORIZED');
    }
}

export class UserForbiddenError extends UserError {
    constructor(message = 'Access denied') {
        super(message, 403, 'USER_FORBIDDEN');
    }
}

// ===== CREDIT ERRORS =====

export class InsufficientCreditsError extends UserError {
    public readonly required: number;
    public readonly available: number;

    constructor(required: number, available: number) {
        super(`Insufficient credits: required ${required}, available ${available}`, 402, 'INSUFFICIENT_CREDITS');
        this.required = required;
        this.available = available;
    }
}

export class CreditOperationError extends UserError {
    constructor(operation: string, reason: string) {
        super(`Credit operation failed: ${operation} - ${reason}`, 400, 'CREDIT_OPERATION_FAILED');
    }
}

// ===== API KEY ERRORS =====

export class InvalidApiProviderError extends UserError {
    constructor(provider: string) {
        super(`Invalid API provider: ${provider}`, 400, 'INVALID_API_PROVIDER');
    }
}

export class ApiKeyNotFoundError extends UserError {
    constructor(provider: string) {
        super(`API key not found for provider: ${provider}`, 404, 'API_KEY_NOT_FOUND');
    }
}

export class ApiKeyEncryptionError extends UserError {
    constructor(operation: 'encrypt' | 'decrypt') {
        super(`Failed to ${operation} API key`, 500, 'API_KEY_ENCRYPTION_FAILED');
    }
}

// ===== VALIDATION ERRORS =====

export class UserValidationError extends UserError {
    public readonly validationErrors: Array<{ field: string; message: string }>;

    constructor(errors: Array<{ field: string; message: string }>) {
        const message = errors.map(e => `${e.field}: ${e.message}`).join('; ');
        super(`User validation failed: ${message}`, 422, 'USER_VALIDATION_ERROR');
        this.validationErrors = errors;
    }
}
