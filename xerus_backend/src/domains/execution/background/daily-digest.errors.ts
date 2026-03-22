// Daily Digest Error Classes
import { DomainError } from '../../../utils/errors';
import type { DigestVariant } from './daily-digest.types';

export class DigestExecutionRecordError extends DomainError {
    public readonly executionId: string;

    constructor(executionId: string) {
        super(
            `Failed to record digest execution: ${executionId}`,
            500,
            'DIGEST_EXECUTION_RECORD_FAILED'
        );
        this.executionId = executionId;
    }
}

export class DigestConfigNotFoundError extends DomainError {
    public readonly userId: string;

    constructor(userId: string) {
        super(
            `Daily digest config not found for user ${userId}`,
            404,
            'DIGEST_CONFIG_NOT_FOUND'
        );
        this.userId = userId;
    }
}

export class DigestGenerationError extends DomainError {
    public readonly variant: DigestVariant;
    public readonly userId: string;

    constructor(variant: DigestVariant, userId: string, reason: string) {
        super(
            `Failed to generate ${variant} digest for user ${userId}: ${reason}`,
            500,
            'DIGEST_GENERATION_FAILED'
        );
        this.variant = variant;
        this.userId = userId;
    }
}
