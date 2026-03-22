// Command Queue Backpressure
// Backpressure evaluation and nested-call deadlock detection

import type { CommandQueueConfig, CommandLane, NestingInfo } from './command-queue.types';
import type { BackpressureAction } from './command-queue.types';
import { NestedCallDeadlockError } from './command-queue.errors';

// Re-export BackpressureAction for consumers
export type { BackpressureAction };

// -----------------------------------------------------------------------------
// Backpressure Evaluation
// -----------------------------------------------------------------------------

export function determineBackpressure(
    config: CommandQueueConfig,
    currentQueueSize: number,
): BackpressureAction {
    if (currentQueueSize >= config.hard_limit) {
        return 'reject';
    }
    if (currentQueueSize >= config.soft_limit) {
        return 'delay';
    }
    return 'accept';
}

// -----------------------------------------------------------------------------
// Nested Call Validation (Deadlock Prevention)
// -----------------------------------------------------------------------------

export function getAgentChain(
    userLanes: Map<string, CommandLane> | undefined,
    laneId: string,
): string[] {
    const chain: string[] = [];
    if (!userLanes) {
        return chain;
    }

    let currentLaneId: string | undefined = laneId;
    const visited = new Set<string>();

    while (currentLaneId && !visited.has(currentLaneId)) {
        visited.add(currentLaneId);
        const lane = userLanes.get(currentLaneId);
        if (!lane) {
            break;
        }

        chain.unshift(lane.agent_slug);
        currentLaneId = lane.nesting?.parent_lane_id;
    }

    return chain;
}

export function validateNestedCall(
    userId: string,
    agentId: string,
    parentLaneId: string,
    userLanes: Map<string, CommandLane> | undefined,
    maxNestingDepth: number,
): void {
    if (!userLanes) {
        return; // Parent lane must exist
    }

    const parentLane = userLanes.get(parentLaneId);
    if (!parentLane) {
        return; // Parent lane not found (may have completed)
    }

    // Build the current call chain
    const agentChain = getAgentChain(userLanes, parentLaneId);

    // Check for circular call (same agent already in chain)
    if (agentChain.includes(agentId)) {
        throw new NestedCallDeadlockError(
            userId,
            agentId,
            parentLaneId,
            'circular_call',
            `Agent ${agentId} already in call chain: ${agentChain.join(' -> ')}`
        );
    }

    // Check nesting depth
    const currentDepth = agentChain.length;
    if (currentDepth >= maxNestingDepth) {
        throw new NestedCallDeadlockError(
            userId,
            agentId,
            parentLaneId,
            'max_depth_exceeded',
            `Current depth ${currentDepth} exceeds maximum ${maxNestingDepth}`
        );
    }
}

export function buildNestingInfo(
    userLanes: Map<string, CommandLane> | undefined,
    parentLaneId: string,
    agentId: string,
): NestingInfo {
    const agentChain = getAgentChain(userLanes, parentLaneId);
    agentChain.push(agentId);

    return {
        parent_lane_id: parentLaneId,
        depth: agentChain.length - 1,
        agent_chain: agentChain,
    };
}

// -----------------------------------------------------------------------------
// Priority Insert
// -----------------------------------------------------------------------------

export function findInsertIndex<T extends { priority: number }>(queue: T[], command: T): number {
    for (let i = 0; i < queue.length; i++) {
        if (command.priority < queue[i].priority) {
            return i;
        }
    }
    return queue.length;
}
