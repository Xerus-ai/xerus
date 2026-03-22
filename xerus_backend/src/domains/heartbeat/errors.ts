// Heartbeat Domain Error Classes
import { AppError } from '../../utils/errors';

// -----------------------------------------------------------------------------
// Heartbeat Config Errors
// -----------------------------------------------------------------------------

export class HeartbeatConfigNotFoundError extends AppError {
    public readonly agentId: number;

    constructor(agentId: number) {
        super(`Heartbeat config not found for agent ${agentId}`, 404, 'HEARTBEAT_CONFIG_NOT_FOUND');
        this.agentId = agentId;
    }
}

export class HeartbeatConfigAccessDeniedError extends AppError {
    public readonly agentId: number;

    constructor(agentId: number) {
        super(`Access denied to heartbeat config for agent ${agentId}`, 403, 'HEARTBEAT_CONFIG_ACCESS_DENIED');
        this.agentId = agentId;
    }
}

// -----------------------------------------------------------------------------
// Heartbeat Execution Errors
// -----------------------------------------------------------------------------

export class HeartbeatExecutionNotFoundError extends AppError {
    public readonly executionId: string;

    constructor(executionId: string) {
        super(`Heartbeat execution not found: ${executionId}`, 404, 'HEARTBEAT_EXECUTION_NOT_FOUND');
        this.executionId = executionId;
    }
}

// -----------------------------------------------------------------------------
// Agent Ownership Errors
// -----------------------------------------------------------------------------

export class AgentOwnershipError extends AppError {
    public readonly agentId: number;
    public readonly userId: string;

    constructor(agentId: number, userId: string) {
        super(`User ${userId} does not own agent ${agentId}`, 403, 'AGENT_ACCESS_DENIED');
        this.agentId = agentId;
        this.userId = userId;
    }
}

export class AgentNotFoundForHeartbeatError extends AppError {
    public readonly agentId: number;

    constructor(agentId: number) {
        super(`Agent ${agentId} not found`, 404, 'AGENT_NOT_FOUND');
        this.agentId = agentId;
    }
}

// -----------------------------------------------------------------------------
// Heartbeat Validation Errors
// -----------------------------------------------------------------------------

export class HeartbeatValidationError extends AppError {
    constructor(message: string) {
        super(message, 400, 'HEARTBEAT_VALIDATION_ERROR');
    }
}

// -----------------------------------------------------------------------------
// Heartbeat Runner Errors
// -----------------------------------------------------------------------------

export class HeartbeatAgentBusyError extends AppError {
    public readonly agentId: number;

    constructor(agentId: number) {
        super(`Agent ${agentId} is currently executing a heartbeat`, 409, 'HEARTBEAT_AGENT_BUSY');
        this.agentId = agentId;
    }
}

export class HeartbeatAgentPausedError extends AppError {
    public readonly agentId: number;

    constructor(agentId: number) {
        super(`Agent ${agentId} is paused waiting for human input`, 409, 'HEARTBEAT_AGENT_PAUSED');
        this.agentId = agentId;
    }
}

export class HeartbeatBudgetExceededError extends AppError {
    public readonly agentId: number;
    public readonly spent: number;
    public readonly budget: number;

    constructor(agentId: number, spent: number, budget: number) {
        super(
            `Agent ${agentId} exceeded daily token budget: ${spent}/${budget}`,
            429,
            'HEARTBEAT_BUDGET_EXCEEDED'
        );
        this.agentId = agentId;
        this.spent = spent;
        this.budget = budget;
    }
}

export class HeartbeatOutsideActiveHoursError extends AppError {
    public readonly agentId: number;

    constructor(agentId: number) {
        super(`Agent ${agentId} is outside configured active hours`, 409, 'HEARTBEAT_OUTSIDE_ACTIVE_HOURS');
        this.agentId = agentId;
    }
}
