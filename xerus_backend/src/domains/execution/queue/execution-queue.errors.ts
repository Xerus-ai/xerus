// Execution Queue Error Classes
import { DomainError } from '../../../utils/errors';
import { ConflictReason } from './execution-lane.types';

// -----------------------------------------------------------------------------
// Queue Conflict Errors
// -----------------------------------------------------------------------------

export class QueueConflictError extends DomainError {
    public readonly reason: ConflictReason;
    public readonly userId: string;
    public readonly agentSlug: string;

    constructor(reason: ConflictReason, userId: string, agentSlug: string, message: string) {
        super(message, 409, 'QUEUE_CONFLICT');
        this.reason = reason;
        this.userId = userId;
        this.agentSlug = agentSlug;
    }
}

export class AgentAlreadyRunningError extends QueueConflictError {
    constructor(userId: string, agentSlug: string) {
        super('agent_already_running', userId, agentSlug, `Agent '${agentSlug}' already has an active execution for user ${userId}`);
    }
}

export class QueueFullError extends QueueConflictError {
    public readonly maxQueueSize: number;

    constructor(userId: string, agentSlug: string, maxQueueSize: number) {
        super('queue_full', userId, agentSlug, `Queue is full for user ${userId}. Maximum ${maxQueueSize} pending requests allowed`);
        this.maxQueueSize = maxQueueSize;
    }
}

export class UserLaneLimitError extends QueueConflictError {
    public readonly maxConcurrent: number;

    constructor(userId: string, agentSlug: string, maxConcurrent: number) {
        super('user_lane_limit', userId, agentSlug, `User ${userId} has reached maximum concurrent executions (${maxConcurrent})`);
        this.maxConcurrent = maxConcurrent;
    }
}

// -----------------------------------------------------------------------------
// Lane Errors
// -----------------------------------------------------------------------------

export class LaneNotFoundError extends DomainError {
    public readonly laneId: string;

    constructor(laneId: string) {
        super(`Execution lane ${laneId} not found`, 404, 'LANE_NOT_FOUND');
        this.laneId = laneId;
    }
}

