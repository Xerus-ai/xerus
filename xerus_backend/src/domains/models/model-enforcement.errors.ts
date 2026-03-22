// Model Enforcement Error Classes
import { DomainError } from '../../utils/errors';
import type { ModelErrorCode } from './model-enforcement.types';

export class ModelEnforcementError extends DomainError {
    public readonly modelErrorCode: ModelErrorCode;

    constructor(modelErrorCode: ModelErrorCode, message: string) {
        const statusCode = 400;
        super(message, statusCode, modelErrorCode);
        this.modelErrorCode = modelErrorCode;
    }
}
