// Team Memory Errors
// Domain-specific error classes for team memory operations.
// Follows the pattern from git-memory/errors.ts

import { GitMemoryError } from './errors';

// -----------------------------------------------------------------------------
// Team Memory Errors
// -----------------------------------------------------------------------------

export class TeamMemoryError extends GitMemoryError {
    constructor(message: string) {
        super(message);
        this.name = 'TeamMemoryError';
    }
}

export class TeamContextRequiredError extends TeamMemoryError {
    constructor(operation: string) {
        super(`Team context is required for operation: ${operation}`);
        this.name = 'TeamContextRequiredError';
    }
}

export class InvalidTeamQueryScopeError extends TeamMemoryError {
    public readonly scope: string;

    constructor(scope: string) {
        super(`Invalid team query scope: "${scope}". Must be one of: agent, team, both`);
        this.name = 'InvalidTeamQueryScopeError';
        this.scope = scope;
    }
}

export class PromotionThresholdError extends TeamMemoryError {
    public readonly significance: number;
    public readonly threshold: number;

    constructor(significance: number, threshold: number) {
        super(
            `Memory significance ${significance.toFixed(2)} is below promotion threshold ${threshold.toFixed(2)}`
        );
        this.name = 'PromotionThresholdError';
        this.significance = significance;
        this.threshold = threshold;
    }
}

export class CoordinatorNotInTeamError extends TeamMemoryError {
    public readonly coordinatorAgentId: number;
    public readonly teamId: number;

    constructor(coordinatorAgentId: number, teamId: number) {
        super(
            `Coordinator agent ${coordinatorAgentId} is not a member of team ${teamId}`
        );
        this.name = 'CoordinatorNotInTeamError';
        this.coordinatorAgentId = coordinatorAgentId;
        this.teamId = teamId;
    }
}

export class DuplicatePromotionError extends TeamMemoryError {
    public readonly contentHash: string;

    constructor(contentHash: string) {
        super(`Memory with content hash "${contentHash}" has already been promoted to team scope`);
        this.name = 'DuplicatePromotionError';
        this.contentHash = contentHash;
    }
}
