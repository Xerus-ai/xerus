// HITL Error Classes
// Fail-fast errors for HITL pause/resume operations

import { DomainError } from '../../../utils/errors';

export class PauseStateNotFoundError extends DomainError {
    public readonly pauseId: string;

    constructor(pauseId: string) {
        super(
            `No pending pause state found with ID '${pauseId}'`,
            404,
            'PAUSE_STATE_NOT_FOUND'
        );
        this.pauseId = pauseId;
    }
}

export class PauseStateAlreadyResolvedError extends DomainError {
    public readonly pauseId: string;
    public readonly resolution: string;

    constructor(pauseId: string, resolution: string) {
        super(
            `Pause state '${pauseId}' already resolved as '${resolution}'`,
            409,
            'PAUSE_STATE_ALREADY_RESOLVED'
        );
        this.pauseId = pauseId;
        this.resolution = resolution;
    }
}

export class NoPendingApprovalError extends DomainError {
    public readonly executionId: string;

    constructor(executionId: string) {
        super(
            `No pending approval found for execution '${executionId}'`,
            404,
            'NO_PENDING_APPROVAL'
        );
        this.executionId = executionId;
    }
}
