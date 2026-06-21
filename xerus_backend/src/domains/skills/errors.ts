// Skills Domain Error Classes
import { AppError } from '../../utils/errors';

export class SkillError extends AppError {
    constructor(message: string, statusCode: number, code: string) {
        super(message, statusCode, code);
    }
}

export class SkillNotFoundError extends SkillError {
    constructor(slug: string) {
        super(`Skill "${slug}" not found`, 404, 'SKILL_NOT_FOUND');
    }
}

export class SkillAccessDeniedError extends SkillError {
    constructor(slug: string) {
        super(`Access denied to skill "${slug}"`, 403, 'SKILL_ACCESS_DENIED');
    }
}

export class SkillUnauthorizedError extends SkillError {
    constructor() {
        super('Authentication required', 401, 'UNAUTHORIZED');
    }
}

export class SkillValidationError extends SkillError {
    public readonly validationErrors: Array<{ field: string; message: string }>;

    constructor(errors: Array<{ field: string; message: string }>) {
        const message = errors.map(e => `${e.field}: ${e.message}`).join('; ');
        super(`Skill validation failed: ${message}`, 422, 'SKILL_VALIDATION_ERROR');
        this.validationErrors = errors;
    }
}

export class SkillNotInstalledError extends SkillError {
    constructor(slug: string) {
        super(`Skill "${slug}" is not installed`, 404, 'SKILL_NOT_INSTALLED');
    }
}

export class SkillNotModifiableError extends SkillError {
    constructor(slug: string, reason: string) {
        super(`Skill "${slug}" cannot be modified: ${reason}`, 403, 'SKILL_NOT_MODIFIABLE');
    }
}

export class SkillSecretNotFoundError extends SkillError {
    constructor(slug: string, envKey: string) {
        super(`Secret "${envKey}" not found for skill "${slug}"`, 404, 'SKILL_SECRET_NOT_FOUND');
    }
}

export class SkillSecretBlockedKeyError extends SkillError {
    constructor(_key: string) {
        super('Environment variable key is not permitted', 422, 'SKILL_SECRET_KEY_NOT_PERMITTED');
    }
}

export class SkillSecretInvalidKeyError extends SkillError {
    constructor(_key: string, _reason: string) {
        super('Environment variable key is not permitted', 422, 'SKILL_SECRET_KEY_NOT_PERMITTED');
    }
}

export class SkillSecretInvalidValueError extends SkillError {
    constructor(key: string, reason: string) {
        super(`Invalid value for "${key}": ${reason}`, 422, 'SKILL_SECRET_INVALID_VALUE');
    }
}

export class SandboxNotReadyError extends Error {
    constructor(userId: string) {
        super(`No running sandbox for user ${userId}`);
        this.name = 'SandboxNotReadyError';
    }
}
