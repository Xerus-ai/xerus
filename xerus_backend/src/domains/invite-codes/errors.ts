// Invite Codes Domain Error Classes
import { AppError } from '../../utils/errors';

export class InviteCodeError extends AppError {
    constructor(message: string, statusCode: number, code: string) {
        super(message, statusCode, code);
    }
}

export class InvalidInviteCodeError extends InviteCodeError {
    constructor() {
        super('Invalid or expired invite code', 404, 'INVITE_CODE_INVALID');
    }
}

export class InviteCodeAlreadyUsedError extends InviteCodeError {
    constructor() {
        super('This invite code has already been used', 409, 'INVITE_CODE_USED');
    }
}

export class InviteCodeValidationError extends InviteCodeError {
    public readonly validationErrors: Array<{ field: string; message: string }>;

    constructor(errors: Array<{ field: string; message: string }>) {
        const message = errors.map(e => `${e.field}: ${e.message}`).join('; ');
        super(`Invite code validation failed: ${message}`, 422, 'INVITE_CODE_VALIDATION_ERROR');
        this.validationErrors = errors;
    }
}
