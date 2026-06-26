// Execution Queue Service
// Manages concurrent agent execution within shared per-user sandbox
// Uses in-memory queues with priority-based ordering

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { logger } from '../../../utils/logger';
import {
    ExecutionQueueRequest,
    CreateExecutionRequest,
    ExecutionLane,
    QueueConfig,
    DEFAULT_QUEUE_CONFIG,
    QueuePosition,
    UserQueueState,
    ConflictCheckResult,
    TRIGGER_PRIORITIES,
    StaleLaneCleanupResult,
} from './execution-lane.types';
import { AgentAlreadyRunningError, QueueFullError, LaneNotFoundError } from './execution-queue.errors';

const log = logger('ExecutionQueueService');

export class ExecutionQueueService extends EventEmitter {
    private readonly config: QueueConfig;

    // Per-user priority queues: userId -> sorted array of requests
    private readonly queues: Map<string, ExecutionQueueRequest[]> = new Map();

    // Active execution lanes: userId -> Set of lanes
    private readonly activeLanes: Map<string, Map<string, ExecutionLane>> = new Map();

    // Request lookup: requestId -> request (for position queries)
    private readonly requestIndex: Map<string, ExecutionQueueRequest> = new Map();

    private cleanupTimer: ReturnType<typeof setInterval> | null = null;

    constructor(config: Partial<QueueConfig> = {}) {
        super();
        this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
    }

    /**
     * Start periodic stale lane cleanup (replaces per-execution cleanup).
     * Runs every intervalMs (default: 30s). Call once at server startup.
     */
    startPeriodicCleanup(intervalMs = 30_000): void {
        if (this.cleanupTimer) return;
        this.cleanupTimer = setInterval(() => this.cleanupStaleLanes(), intervalMs);
        // Allow process to exit even if timer is running
        if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
            this.cleanupTimer.unref();
        }
    }

    stopPeriodicCleanup(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    // -------------------------------------------------------------------------
    // Queue Operations
    // -------------------------------------------------------------------------

    /**
     * Add a request to the queue
     * @returns Position in queue (0 = will be executed next)
     */
    enqueue(input: CreateExecutionRequest): QueuePosition {
        const userId = input.user_id;
        const agentSlug = input.agent_slug;

        // Check for conflicts before enqueueing
        const conflictCheck = this.checkConflicts(userId, agentSlug);
        if (conflictCheck.conflict) {
            if (conflictCheck.reason === 'agent_already_running') {
                throw new AgentAlreadyRunningError(userId, agentSlug);
            }
            if (conflictCheck.reason === 'queue_full') {
                throw new QueueFullError(userId, agentSlug, this.config.max_queue_size);
            }
        }

        const request: ExecutionQueueRequest = {
            id: randomUUID(),
            user_id: userId,
            agent_slug: agentSlug,
            trigger_type: input.trigger_type,
            priority: TRIGGER_PRIORITIES[input.trigger_type],
            prompt: input.prompt,
            coordination_mode: input.coordination_mode,
            created_at: new Date(),
        };

        // Get or create queue for user
        let queue = this.queues.get(userId);
        if (!queue) {
            queue = [];
            this.queues.set(userId, queue);
        }

        // Insert in priority order (lower priority number = higher priority)
        // Within same priority, FIFO by created_at
        const insertIndex = this.findInsertIndex(queue, request);
        queue.splice(insertIndex, 0, request);

        // Index for fast lookup
        this.requestIndex.set(request.id, request);

        return {
            request_id: request.id,
            position: insertIndex,
        };
    }

    /**
     * Get the next available request for execution (if lane available)
     * Removes from queue and creates an active lane
     * @returns Lane info or null if no slots available or queue empty
     */
    acquire(userId: string): ExecutionLane | null {
        const queue = this.queues.get(userId);
        if (!this.hasAvailableSlot(userId) || !queue || queue.length === 0) {
            return null;
        }

        const request = queue.shift()!;
        return this.claimRequest(userId, request);
    }

    /**
     * Claim a specific queued request for execution.
     * Used by long-lived request handlers so they only ever execute the request they enqueued.
     */
    acquireRequest(userId: string, requestId: string): ExecutionLane | null {
        const queue = this.queues.get(userId);
        if (!this.hasAvailableSlot(userId) || !queue || queue.length === 0) {
            return null;
        }

        const requestIndex = queue.findIndex((request) => request.id === requestId);
        if (requestIndex === -1) {
            return null;
        }

        const [request] = queue.splice(requestIndex, 1);
        return this.claimRequest(userId, request);
    }

    /**
     * Release a lane after execution completes
     */
    release(laneId: string): void {
        // Find and remove lane
        for (const [userId, lanes] of this.activeLanes) {
            if (lanes.has(laneId)) {
                const lane = lanes.get(laneId)!;
                lanes.delete(laneId);
                if (lanes.size === 0) {
                    this.activeLanes.delete(userId);
                }
                // Notify waiters that a lane freed up for this user/agent
                this.emit('lane_released', { userId, agentSlug: lane.agent_slug, laneId });
                return;
            }
        }
        throw new LaneNotFoundError(laneId);
    }

    /**
     * Wait until the specified agent is no longer running for this user.
     * Resolves when lane is released; rejects on abort signal or timeout.
     */
    waitForAgentAvailable(userId: string, agentSlug: string, signal?: AbortSignal): Promise<void> {
        // Already available — resolve immediately
        if (!this.isAgentRunning(userId, agentSlug)) {
            return Promise.resolve();
        }

        return new Promise<void>((resolve, reject) => {
            const onRelease = (event: { userId: string; agentSlug: string }) => {
                if (event.userId === userId && event.agentSlug === agentSlug) {
                    cleanup();
                    resolve();
                }
            };

            const onAbort = () => {
                cleanup();
                reject(new Error('Aborted while waiting for agent availability'));
            };

            const cleanup = () => {
                this.removeListener('lane_released', onRelease);
                signal?.removeEventListener('abort', onAbort);
            };

            this.on('lane_released', onRelease);
            signal?.addEventListener('abort', onAbort, { once: true });

            // Check again after listener is attached (race condition guard)
            if (!this.isAgentRunning(userId, agentSlug)) {
                cleanup();
                resolve();
            }
        });
    }

    /**
     * Get position of a request in queue
     */
    getQueuePosition(requestId: string): QueuePosition | null {
        const request = this.requestIndex.get(requestId);
        if (!request) {
            return null;
        }

        const queue = this.queues.get(request.user_id);
        if (!queue) {
            return null;
        }

        const position = queue.findIndex((r) => r.id === requestId);
        if (position === -1) {
            return null;
        }

        return {
            request_id: requestId,
            position,
        };
    }

    /**
     * Get all active lanes for a user
     */
    getActiveLanes(userId: string): ExecutionLane[] {
        const lanes = this.activeLanes.get(userId);
        return lanes ? Array.from(lanes.values()) : [];
    }

    /**
     * Check if a specific agent is currently executing for a user
     */
    isAgentRunning(userId: string, agentSlug: string): boolean {
        const lanes = this.activeLanes.get(userId);
        if (!lanes) {
            return false;
        }

        for (const lane of lanes.values()) {
            if (lane.agent_slug === agentSlug) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check if an agent is already queued for a user
     */
    isAgentQueued(userId: string, agentSlug: string): boolean {
        const queue = this.queues.get(userId);
        if (!queue) {
            return false;
        }
        return queue.some((r) => r.agent_slug === agentSlug);
    }

    /**
     * Get the full queue state for a user
     */
    getUserQueueState(userId: string): UserQueueState {
        const activeLanes = this.getActiveLanes(userId);
        const queue = this.queues.get(userId);
        const pendingCount = queue?.length ?? 0;

        return {
            user_id: userId,
            active_lanes: activeLanes,
            pending_count: pendingCount,
            available_slots: Math.max(0, this.config.max_concurrent - activeLanes.length),
        };
    }

    /**
     * Cleanup stale lanes that have been running longer than timeout
     * @returns Array of cleaned up stale lane info for logging/auditing
     */
    cleanupStaleLanes(timeoutMs?: number): StaleLaneCleanupResult[] {
        const timeout = timeoutMs ?? this.config.stale_timeout_ms;
        const now = Date.now();
        const cleanedLanes: StaleLaneCleanupResult[] = [];

        for (const [userId, lanes] of this.activeLanes) {
            const staleLaneIds: string[] = [];

            for (const [laneId, lane] of lanes) {
                // Skip lanes without started_at (shouldn't happen but handle gracefully)
                if (!lane.started_at) {
                    continue;
                }
                const ageMs = now - lane.started_at.getTime();
                if (ageMs > timeout) {
                    staleLaneIds.push(laneId);
                    // Record details for logging/auditing
                    cleanedLanes.push({
                        lane_id: laneId,
                        user_id: userId,
                        agent_slug: lane.agent_slug,
                        request_id: lane.request_id,
                        started_at: lane.started_at,
                        age_ms: ageMs,
                        timeout_ms: timeout,
                    });
                }
            }

            for (const laneId of staleLaneIds) {
                const lane = lanes.get(laneId);
                lanes.delete(laneId);
                if (lane) {
                    this.emit('lane_released', { userId, agentSlug: lane.agent_slug, laneId });
                }
            }

            if (lanes.size === 0) {
                this.activeLanes.delete(userId);
            }
        }

        // Log cleanup summary if any lanes were cleaned
        if (cleanedLanes.length > 0) {
            log.warn('Cleaned up stale lanes', { count: cleanedLanes.length, lanes: cleanedLanes.map((l) => ({ lane: l.lane_id.slice(0, 8), user: l.user_id, agent: l.agent_slug, age_s: Math.round(l.age_ms / 1000) })) });
        }

        return cleanedLanes;
    }

    /**
     * Cancel a pending request (remove from queue)
     * @returns true if cancelled, false if not found or already running
     */
    cancel(requestId: string): boolean {
        const request = this.requestIndex.get(requestId);
        if (!request) {
            return false;
        }

        const queue = this.queues.get(request.user_id);
        if (!queue) {
            return false;
        }

        const index = queue.findIndex((r) => r.id === requestId);
        if (index === -1) {
            return false;
        }

        queue.splice(index, 1);
        this.requestIndex.delete(requestId);

        if (queue.length === 0) {
            this.queues.delete(request.user_id);
        }

        return true;
    }

    /**
     * Get active lane count for a user
     */
    getActiveCount(userId: string): number {
        const lanes = this.activeLanes.get(userId);
        return lanes?.size ?? 0;
    }

    private hasAvailableSlot(userId: string): boolean {
        const userLanes = this.activeLanes.get(userId);
        const activeCount = userLanes?.size ?? 0;
        return activeCount < this.config.max_concurrent;
    }

    private claimRequest(userId: string, request: ExecutionQueueRequest): ExecutionLane {
        this.requestIndex.delete(request.id);

        const lane: ExecutionLane = {
            lane_id: randomUUID(),
            user_id: userId,
            lane_number: (this.activeLanes.get(userId)?.size ?? 0) + 1,
            agent_slug: request.agent_slug,
            request_id: request.id,
            busy: true,
            started_at: new Date(),
            last_activity_at: new Date(),
            status: 'running',
            prompt: request.prompt,
            trigger_type: request.trigger_type,
            coordination_mode: request.coordination_mode,
        };

        let lanes = this.activeLanes.get(userId);
        if (!lanes) {
            lanes = new Map();
            this.activeLanes.set(userId, lanes);
        }
        lanes.set(lane.lane_id, lane);

        return lane;
    }

    /**
     * Get pending queue count for a user
     */
    getPendingCount(userId: string): number {
        const queue = this.queues.get(userId);
        return queue?.length ?? 0;
    }

    // -------------------------------------------------------------------------
    // Internal Helpers
    // -------------------------------------------------------------------------

    /**
     * Check for conflicts before adding to queue.
     * Multiple pending messages per agent are allowed (the frontend queues
     * messages client-side and drains them one at a time). Only the total
     * queue size is enforced to prevent unbounded growth.
     */
    private checkConflicts(userId: string, _agentSlug: string): ConflictCheckResult {
        const pendingCount = this.getPendingCount(userId);
        if (pendingCount >= this.config.max_queue_size) {
            return {
                conflict: true,
                reason: 'queue_full',
                message: `Queue is full. Maximum ${this.config.max_queue_size} pending requests`,
            };
        }

        return { conflict: false };
    }

    /**
     * Find the correct insertion index for priority ordering
     * Lower priority number = higher priority = earlier in array
     * Within same priority, append (FIFO)
     */
    private findInsertIndex(queue: ExecutionQueueRequest[], request: ExecutionQueueRequest): number {
        for (let i = 0; i < queue.length; i++) {
            if (request.priority < queue[i].priority) {
                return i;
            }
        }
        return queue.length;
    }
}

// Singleton instance
export const executionQueueService = new ExecutionQueueService();
