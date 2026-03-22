// Command Queue Service
// Manages command queue with backpressure, deadlock prevention, and metrics.
//
// Split: metrics logic in command-queue.metrics.ts,
//        backpressure/nesting in command-queue.backpressure.ts

import { randomUUID } from 'crypto';
import {
    CreateExecutionRequest,
    TRIGGER_PRIORITIES,
    TriggerType,
} from './execution-lane.types';
import {
    CommandQueueConfig,
    DEFAULT_COMMAND_QUEUE_CONFIG,
    CommandQueuePosition,
    QueueMetrics,
    GlobalMetrics,
    CommandLane,
    UserMetricsState,
} from './command-queue.types';
import {
    BackpressureRejectedError,
    QueueOverflowError,
    InvalidConcurrencyError,
    CommandLaneNotFoundError,
} from './command-queue.errors';
import {
    determineBackpressure,
    validateNestedCall,
    buildNestingInfo,
    findInsertIndex,
} from './command-queue.backpressure';
import {
    createEmptyMetricsState,
    incrementProcessed,
    incrementRejected,
    recordWaitTime,
    recordProcessingTime,
    computeUserMetrics,
    computeGlobalMetrics,
    calculateEstimatedWait,
} from './command-queue.metrics';

// BackpressureAction type is exported from command-queue.types.ts (via barrel)

// Extended request type with optional parent lane
interface CommandRequest extends CreateExecutionRequest {
    parent_lane_id?: string;
}

// Internal request with metadata
interface QueuedCommand {
    id: string;
    user_id: string;
    agent_slug: string;
    trigger_type: TriggerType;
    priority: number;
    prompt: string;
    coordination_mode?: string;
    created_at: Date;
    parent_lane_id?: string;
}

export class CommandQueueService {
    private readonly config: CommandQueueConfig;

    // Per-user priority queues: userId -> sorted array of requests
    private readonly queues: Map<string, QueuedCommand[]> = new Map();

    // Active lanes: userId -> Map<laneId, CommandLane>
    private readonly activeLanes: Map<string, Map<string, CommandLane>> = new Map();

    // Request lookup: requestId -> QueuedCommand
    private readonly requestIndex: Map<string, QueuedCommand> = new Map();

    // Per-user metrics state
    private readonly metricsState: Map<string, UserMetricsState> = new Map();

    // Lane to user mapping for quick lookup
    private readonly laneToUser: Map<string, string> = new Map();

    constructor(config: Partial<CommandQueueConfig> = {}) {
        this.config = { ...DEFAULT_COMMAND_QUEUE_CONFIG, ...config };
    }

    // -------------------------------------------------------------------------
    // Core Queue Operations
    // -------------------------------------------------------------------------

    enqueueCommandInLane(input: CommandRequest): CommandQueuePosition {
        const userId = input.user_id;
        const agentId = input.agent_slug;

        const state = this.ensureMetricsState(userId);

        // Check for nested call deadlock
        if (input.parent_lane_id) {
            validateNestedCall(userId, agentId, input.parent_lane_id, this.activeLanes.get(userId), this.config.max_nesting_depth);
        }

        const queueSize = this.getQueueSize(userId);

        if (queueSize >= this.config.max_queue_size) {
            incrementRejected(state);
            throw new QueueOverflowError(userId, queueSize, this.config.max_queue_size);
        }

        const backpressureAction = determineBackpressure(this.config, queueSize);

        if (backpressureAction === 'reject') {
            incrementRejected(state);
            throw new BackpressureRejectedError(userId, queueSize, this.config.hard_limit);
        }

        const command: QueuedCommand = {
            id: randomUUID(),
            user_id: userId,
            agent_slug: agentId,
            trigger_type: input.trigger_type,
            priority: TRIGGER_PRIORITIES[input.trigger_type],
            prompt: input.prompt,
            coordination_mode: input.coordination_mode,
            created_at: new Date(),
            parent_lane_id: input.parent_lane_id,
        };

        let queue = this.queues.get(userId);
        if (!queue) {
            queue = [];
            this.queues.set(userId, queue);
        }

        const insertIndex = findInsertIndex(queue, command);
        queue.splice(insertIndex, 0, command);

        this.requestIndex.set(command.id, command);

        const estimatedWaitMs = calculateEstimatedWait(
            this.metricsState.get(userId),
            insertIndex,
            this.config.delay_multiplier_ms,
        );

        return {
            request_id: command.id,
            position: insertIndex,
            backpressure_action: backpressureAction,
            estimated_wait_ms: backpressureAction === 'delay' ? estimatedWaitMs : undefined,
        };
    }

    acquireFromQueue(userId: string, parentLaneId?: string): CommandLane | null {
        const userLanes = this.activeLanes.get(userId);
        const activeCount = userLanes?.size ?? 0;
        const maxConcurrent = this.getMaxConcurrentForUser(userId);

        const isNestedCall = parentLaneId !== undefined;
        if (!isNestedCall && activeCount >= maxConcurrent) {
            return null;
        }

        const queue = this.queues.get(userId);
        if (!queue || queue.length === 0) {
            return null;
        }

        let commandIndex: number;
        if (isNestedCall) {
            commandIndex = queue.findIndex((c) => c.parent_lane_id === parentLaneId);
            if (commandIndex === -1) {
                return null;
            }
        } else {
            commandIndex = 0;
        }

        const command = queue.splice(commandIndex, 1)[0];
        this.requestIndex.delete(command.id);

        const waitTimeMs = Date.now() - command.created_at.getTime();
        recordWaitTime(this.ensureMetricsState(userId), waitTimeMs);

        let nesting = undefined;
        if (parentLaneId) {
            nesting = buildNestingInfo(this.activeLanes.get(userId), parentLaneId, command.agent_slug);
        }

        const lane: CommandLane = {
            lane_id: randomUUID(),
            user_id: userId,
            agent_slug: command.agent_slug,
            request_id: command.id,
            started_at: new Date(),
            status: 'running',
            prompt: command.prompt,
            trigger_type: command.trigger_type,
            coordination_mode: command.coordination_mode,
            nesting,
        };

        let lanes = this.activeLanes.get(userId);
        if (!lanes) {
            lanes = new Map();
            this.activeLanes.set(userId, lanes);
        }
        lanes.set(lane.lane_id, lane);
        this.laneToUser.set(lane.lane_id, userId);

        return lane;
    }

    releaseFromQueue(laneId: string, processingTimeMs?: number): void {
        const userId = this.laneToUser.get(laneId);
        if (!userId) {
            throw new CommandLaneNotFoundError(laneId);
        }

        const lanes = this.activeLanes.get(userId);
        if (!lanes || !lanes.has(laneId)) {
            throw new CommandLaneNotFoundError(laneId);
        }

        lanes.delete(laneId);
        this.laneToUser.delete(laneId);

        if (lanes.size === 0) {
            this.activeLanes.delete(userId);
        }

        const state = this.ensureMetricsState(userId);
        incrementProcessed(state);
        if (processingTimeMs !== undefined) {
            recordProcessingTime(state, processingTimeMs);
        }
    }

    // -------------------------------------------------------------------------
    // Queue State
    // -------------------------------------------------------------------------

    getQueueSize(userId: string): number {
        const queue = this.queues.get(userId);
        return queue?.length ?? 0;
    }

    setMaxConcurrency(userId: string, maxConcurrent: number): void {
        if (maxConcurrent < 1 || maxConcurrent > this.config.max_concurrent_ceiling) {
            throw new InvalidConcurrencyError(userId, maxConcurrent, 1, this.config.max_concurrent_ceiling);
        }

        const state = this.ensureMetricsState(userId);
        state.custom_max_concurrent = maxConcurrent;
    }

    getActiveLanes(userId: string): CommandLane[] {
        const lanes = this.activeLanes.get(userId);
        return lanes ? Array.from(lanes.values()) : [];
    }

    // -------------------------------------------------------------------------
    // Metrics
    // -------------------------------------------------------------------------

    getMetrics(userId: string): QueueMetrics {
        const state = this.ensureMetricsState(userId);
        const queueDepth = this.getQueueSize(userId);
        const activeLanes = this.activeLanes.get(userId)?.size ?? 0;
        const maxConcurrent = this.getMaxConcurrentForUser(userId);

        return computeUserMetrics(state, queueDepth, activeLanes, maxConcurrent, this.config.max_queue_size);
    }

    getGlobalMetrics(): GlobalMetrics {
        const allUserIds = new Set([...this.queues.keys(), ...this.activeLanes.keys()]);
        const allMetrics: QueueMetrics[] = [];

        for (const userId of allUserIds) {
            allMetrics.push(this.getMetrics(userId));
        }

        return computeGlobalMetrics(allMetrics);
    }

    // -------------------------------------------------------------------------
    // Internal Helpers
    // -------------------------------------------------------------------------

    private getMaxConcurrentForUser(userId: string): number {
        const state = this.metricsState.get(userId);
        return state?.custom_max_concurrent ?? this.config.max_concurrent;
    }

    private ensureMetricsState(userId: string): UserMetricsState {
        let state = this.metricsState.get(userId);
        if (!state) {
            state = createEmptyMetricsState();
            this.metricsState.set(userId, state);
        }
        return state;
    }
}

// Singleton instance
export const commandQueueService = new CommandQueueService();
