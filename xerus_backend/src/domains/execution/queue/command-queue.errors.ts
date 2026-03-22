// Command Queue Error Classes
import { DomainError } from '../../../utils/errors';

// -----------------------------------------------------------------------------
// Backpressure Errors
// -----------------------------------------------------------------------------

export class BackpressureRejectedError extends DomainError {
    public readonly userId: string;
    public readonly queueDepth: number;
    public readonly hardLimit: number;

    constructor(userId: string, queueDepth: number, hardLimit: number) {
        super(
            `Request rejected due to backpressure. Queue depth ${queueDepth} exceeds hard limit ${hardLimit} for user ${userId}`,
            429,
            'BACKPRESSURE_REJECTED'
        );
        this.userId = userId;
        this.queueDepth = queueDepth;
        this.hardLimit = hardLimit;
    }
}

export class QueueOverflowError extends DomainError {
    public readonly userId: string;
    public readonly queueSize: number;
    public readonly maxQueueSize: number;

    constructor(userId: string, queueSize: number, maxQueueSize: number) {
        super(
            `Queue overflow for user ${userId}. Queue size ${queueSize} exceeds maximum ${maxQueueSize}`,
            429,
            'QUEUE_OVERFLOW'
        );
        this.userId = userId;
        this.queueSize = queueSize;
        this.maxQueueSize = maxQueueSize;
    }
}

// -----------------------------------------------------------------------------
// Deadlock Prevention Errors
// -----------------------------------------------------------------------------

export class NestedCallDeadlockError extends DomainError {
    public readonly userId: string;
    public readonly agentSlug: string;
    public readonly parentLaneId: string;
    public readonly reason: 'circular_call' | 'max_depth_exceeded';

    constructor(
        userId: string,
        agentSlug: string,
        parentLaneId: string,
        reason: 'circular_call' | 'max_depth_exceeded',
        details?: string
    ) {
        const message =
            reason === 'circular_call'
                ? `Circular nested call detected for agent ${agentSlug} in user ${userId}. ${details || ''}`
                : `Maximum nesting depth exceeded for agent ${agentSlug} in user ${userId}. ${details || ''}`;

        super(message, 409, 'NESTED_CALL_DEADLOCK');
        this.userId = userId;
        this.agentSlug = agentSlug;
        this.parentLaneId = parentLaneId;
        this.reason = reason;
    }
}

// -----------------------------------------------------------------------------
// Concurrency Configuration Errors
// -----------------------------------------------------------------------------

export class InvalidConcurrencyError extends DomainError {
    public readonly userId: string;
    public readonly requestedValue: number;
    public readonly minValue: number;
    public readonly maxValue: number;

    constructor(userId: string, requestedValue: number, minValue: number, maxValue: number) {
        super(
            `Invalid concurrency value ${requestedValue} for user ${userId}. Must be between ${minValue} and ${maxValue}`,
            400,
            'INVALID_CONCURRENCY'
        );
        this.userId = userId;
        this.requestedValue = requestedValue;
        this.minValue = minValue;
        this.maxValue = maxValue;
    }
}

// -----------------------------------------------------------------------------
// Lane Errors
// -----------------------------------------------------------------------------

export class CommandLaneNotFoundError extends DomainError {
    public readonly laneId: string;

    constructor(laneId: string) {
        super(`Command lane ${laneId} not found`, 404, 'COMMAND_LANE_NOT_FOUND');
        this.laneId = laneId;
    }
}
