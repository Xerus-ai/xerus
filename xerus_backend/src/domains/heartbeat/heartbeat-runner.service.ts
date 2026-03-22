// Heartbeat Runner Service - Scheduled heartbeat execution with locks, stagger, and event queue.
import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { randomUUID } from 'crypto';
import { HeartbeatConfigRepository, heartbeatConfigRepository } from './heartbeat-config.repository';
import { HeartbeatExecutionRepository, heartbeatExecutionRepository } from './heartbeat-execution.repository';
import { HeartbeatStateRepository, heartbeatStateRepository } from './heartbeat-state.repository';
import { HeartbeatStaggerService, heartbeatStaggerService } from './heartbeat-stagger.service';
import type { HeartbeatConfig, HeartbeatTriggerType, HeartbeatRunResult } from './types';
import { HeartbeatAgentBusyError, HeartbeatAgentPausedError, HeartbeatBudgetExceededError, HeartbeatConfigNotFoundError, HeartbeatConfigAccessDeniedError } from './errors';
import { buildSkipResult, isWeekday } from './heartbeat-runner.utils';

interface ScheduledEntry {
    task: ScheduledTask;
    agent_id: number;
    config_id: number;
    user_id: string;
    stagger_offset_ms: number;
    stagger_timeout?: ReturnType<typeof setTimeout>;
}

export interface HeartbeatDispatchFn {
    (request: {
        agent_id: number;
        user_id: string;
        trigger_type: HeartbeatTriggerType;
        run_id: string;
        config_id: number;
    }): Promise<{ execution_id: string; tokens_used: number; outcome: string }>;
}

export interface HeartbeatSnapshotFn {
    (request: { agent_id: number; user_id: string }): Promise<void>;
}

export class HeartbeatRunnerService {
    private static MAX_EVENT_QUEUE_SIZE = 10;
    private scheduledTasks: Map<number, ScheduledEntry> = new Map();
    private eventQueue: Map<number, Array<{ userId: string }>> = new Map();
    private running = false;
    private dispatchFn: HeartbeatDispatchFn | null = null;
    private snapshotFn: HeartbeatSnapshotFn | null = null;

    constructor(
        private configRepository: HeartbeatConfigRepository = heartbeatConfigRepository,
        private executionRepository: HeartbeatExecutionRepository = heartbeatExecutionRepository,
        private stateRepository: HeartbeatStateRepository = heartbeatStateRepository,
        private staggerService: HeartbeatStaggerService = heartbeatStaggerService
    ) {}

    async start(dispatchFn: HeartbeatDispatchFn, snapshotFn?: HeartbeatSnapshotFn): Promise<void> {
        if (this.running) {
            return;
        }

        this.dispatchFn = dispatchFn;
        this.snapshotFn = snapshotFn ?? null;
        this.running = true;

        const configs = await this.configRepository.listEnabled();

        // Recalculate stagger offsets per user before registering
        const userIds = new Set(configs.map(c => c.user_id));
        for (const userId of userIds) {
            await this.staggerService.recalculateForUser(userId);
        }

        // Re-read configs after recalculation (offsets updated in DB)
        const updatedConfigs = await this.configRepository.listEnabled();

        // Batch-initialize heartbeat state rows for all agents in one query
        const agentIds = updatedConfigs.map(c => c.agent_id);
        await this.stateRepository.batchUpsert(agentIds);

        for (const config of updatedConfigs) {
            this.scheduleAgent(config);
        }
    }

    stop(): void {
        if (!this.running) {
            return;
        }

        for (const [agentId, scheduled] of this.scheduledTasks) {
            scheduled.task.stop();
            if (scheduled.stagger_timeout) {
                clearTimeout(scheduled.stagger_timeout);
            }
            this.scheduledTasks.delete(agentId);
        }

        this.running = false;
        this.dispatchFn = null;
        this.snapshotFn = null;
        this.eventQueue.clear();
    }

    isRunning(): boolean {
        return this.running;
    }

    getRegisteredAgentIds(): number[] {
        return Array.from(this.scheduledTasks.keys());
    }

    async registerAgent(config: HeartbeatConfig): Promise<void> {
        this.scheduleAgent(config);

        if (!config.enabled) {
            return;
        }

        try {
            await this.stateRepository.upsert(config.agent_id);
        } catch (err) {
            console.error(`[HeartbeatRunner] Failed to initialize state for agent ${config.agent_id}:`, err);
        }
    }

    private scheduleAgent(config: HeartbeatConfig): void {
        if (this.scheduledTasks.has(config.agent_id)) {
            this.unregisterAgent(config.agent_id);
        }

        if (!config.enabled) {
            return;
        }

        if (!cron.validate(config.cron_expression)) {
            console.error(
                `Invalid cron expression for agent ${config.agent_id}: ${config.cron_expression}`
            );
            return;
        }

        const task = cron.schedule(
            config.cron_expression,
            () => {
                this.onCronTick(config.agent_id);
            },
            { timezone: config.timezone }
        );

        this.scheduledTasks.set(config.agent_id, {
            task,
            agent_id: config.agent_id,
            config_id: config.id,
            user_id: config.user_id,
            stagger_offset_ms: config.stagger_offset_ms,
        });
    }

    updateStaggerOffset(agentId: number, staggerOffsetMs: number): void {
        const scheduled = this.scheduledTasks.get(agentId);
        if (scheduled) {
            scheduled.stagger_offset_ms = staggerOffsetMs;
        }
    }

    unregisterAgent(agentId: number): void {
        const scheduled = this.scheduledTasks.get(agentId);
        if (!scheduled) {
            return;
        }

        scheduled.task.stop();
        if (scheduled.stagger_timeout) {
            clearTimeout(scheduled.stagger_timeout);
        }
        this.scheduledTasks.delete(agentId);
    }

    private onCronTick(agentId: number): void {
        const scheduled = this.scheduledTasks.get(agentId);
        if (!scheduled) {
            return;
        }

        const staggerMs = scheduled.stagger_offset_ms;
        const run = () => {
            this.runHeartbeatOnce(agentId, 'scheduled').catch((err) => {
                console.error(
                    `[HeartbeatRunner] Scheduled heartbeat failed for agent ${agentId}:`,
                    err instanceof Error ? err.message : err
                );
            });
        };

        if (staggerMs > 0) {
            scheduled.stagger_timeout = setTimeout(run, staggerMs);
        } else {
            run();
        }
    }

    async runHeartbeatOnce(
        agentId: number,
        triggerType: HeartbeatTriggerType
    ): Promise<HeartbeatRunResult> {
        const runId = randomUUID();

        // 1. Load config
        const config = await this.configRepository.getByAgentId(agentId);
        if (!config) {
            throw new HeartbeatConfigNotFoundError(agentId);
        }

        // 2. Check enabled
        if (!config.enabled) {
            return buildSkipResult(agentId, triggerType, runId, 'disabled');
        }

        // 2.5 Check user-wide concurrency limit
        const activeCount = await this.stateRepository.countActiveLocksForUser(config.user_id);
        if (activeCount >= this.staggerService.getMaxConcurrentHeartbeats()) {
            if (triggerType === 'manual') {
                throw new HeartbeatAgentBusyError(agentId);
            }
            return buildSkipResult(agentId, triggerType, runId, 'max_concurrent_reached');
        }

        // 3. Acquire row-level lock (concurrency gate)
        const timeoutMs = config.max_duration_seconds * 1000;
        const lockAcquired = await this.stateRepository.tryAcquireLock(agentId, runId, timeoutMs);
        if (!lockAcquired) {
            if (triggerType === 'manual') {
                throw new HeartbeatAgentBusyError(agentId);
            }
            return buildSkipResult(agentId, triggerType, runId, 'locked');
        }

        try {
            // 4. Check HITL pause state
            const pauseState = await this.stateRepository.checkPauseState(agentId);
            if (pauseState.is_paused) {
                if (triggerType === 'manual') {
                    throw new HeartbeatAgentPausedError(agentId);
                }
                return buildSkipResult(agentId, triggerType, runId, 'paused_for_hitl');
            }

            // 5. Check active hours (scheduled only)
            if (triggerType === 'scheduled') {
                const withinHours = this.staggerService.isWithinActiveHours(
                    config.active_hours_start, config.active_hours_end, config.timezone
                );
                if (!withinHours) {
                    return buildSkipResult(agentId, triggerType, runId, 'outside_active_hours');
                }
            }

            // 6. Check weekday (scheduled only)
            if (triggerType === 'scheduled' && config.weekdays_only && !isWeekday(config.timezone)) {
                return buildSkipResult(agentId, triggerType, runId, 'weekend');
            }

            // 7. Check daily token budget
            const state = await this.stateRepository.getByAgentId(agentId);
            if (state && state.tokens_spent_today >= state.tokens_budget_today) {
                if (triggerType === 'manual') {
                    throw new HeartbeatBudgetExceededError(agentId, state.tokens_spent_today, state.tokens_budget_today);
                }
                return buildSkipResult(agentId, triggerType, runId, 'budget_exceeded');
            }

            // 7.5 Run snapshot for scheduled heartbeats (pre-fetch data before agent wakes)
            if (triggerType === 'scheduled' && this.snapshotFn) {
                try {
                    await this.snapshotFn({ agent_id: agentId, user_id: config.user_id });
                } catch (err) {
                    // Snapshot failure is non-fatal: agent runs with stale/no snapshot
                    console.warn(
                        `[HeartbeatRunner] Snapshot failed for agent ${agentId}, proceeding with heartbeat:`,
                        err instanceof Error ? err.message : err
                    );
                }
            }

            // 8. Create execution record
            const execution = await this.executionRepository.create({
                heartbeat_config_id: config.id,
                agent_id: agentId,
                trigger_type: triggerType,
                scheduled_at: new Date(),
                run_id: runId,
            });

            // 9. Dispatch to agent
            if (!this.dispatchFn) {
                throw new Error('HeartbeatRunner has no dispatch function configured');
            }

            await this.executionRepository.updateStatus(execution.id, 'running', {
                started_at: new Date(),
            });

            const result = await this.dispatchFn({
                agent_id: agentId,
                user_id: config.user_id,
                trigger_type: triggerType,
                run_id: runId,
                config_id: config.id,
            });

            const completedAt = new Date();
            const durationMs = completedAt.getTime() - (execution.started_at ?? completedAt).getTime();
            await this.executionRepository.updateStatus(execution.id, 'completed', {
                completed_at: completedAt,
                outcome: result.outcome as 'success' | 'failure' | 'timeout' | 'suppressed' | 'skipped',
                tokens_used: result.tokens_used,
                duration_ms: durationMs,
            });

            await this.stateRepository.recordRunStart(
                agentId,
                result.outcome as 'success' | 'failure' | 'timeout' | 'suppressed' | 'skipped',
                result.tokens_used
            );

            return {
                agent_id: agentId,
                trigger_type: triggerType,
                run_id: runId,
                skipped: false,
                execution_id: result.execution_id,
            };
        } catch (error) {
            // Record failure if we have an execution
            if (error instanceof HeartbeatAgentBusyError ||
                error instanceof HeartbeatAgentPausedError ||
                error instanceof HeartbeatBudgetExceededError) {
                throw error;
            }

            const errMessage = error instanceof Error ? error.message : String(error);
            await this.stateRepository.recordRunStart(agentId, 'failure', 0, errMessage);
            throw error;
        } finally {
            // Always release lock
            await this.stateRepository.releaseLock(agentId).catch((err) => {
                console.error(`Failed to release lock for agent ${agentId}:`, err);
            });
            this.drainEventQueue(agentId);
        }
    }

    async triggerEvent(agentId: number, userId: string): Promise<HeartbeatRunResult> {
        const result = await this.runHeartbeatOnce(agentId, 'event');
        if (result.skipped && (result.skip_reason === 'locked' || result.skip_reason === 'max_concurrent_reached')) {
            const queued = this.enqueueEvent(agentId, userId);
            return { ...result, skip_reason: queued ? 'queued' : 'queue_full' };
        }
        return result;
    }

    private enqueueEvent(agentId: number, userId: string): boolean {
        const queue = this.eventQueue.get(agentId) ?? [];
        if (queue.length >= HeartbeatRunnerService.MAX_EVENT_QUEUE_SIZE) {
            return false;
        }
        queue.push({ userId });
        this.eventQueue.set(agentId, queue);
        return true;
    }

    private drainEventQueue(agentId: number): void {
        const queue = this.eventQueue.get(agentId);
        if (!queue || queue.length === 0) return;

        const next = queue.shift()!;
        if (queue.length === 0) this.eventQueue.delete(agentId);

        // Fire-and-forget: process next queued event
        this.runHeartbeatOnce(agentId, 'event').catch(err => {
            console.error(
                `[HeartbeatRunner] Queued event heartbeat failed for agent ${agentId} (userId=${next.userId}):`,
                err instanceof Error ? err.message : err
            );
        });
    }

    async forceRun(agentId: number, userId: string): Promise<HeartbeatRunResult> {
        const config = await this.configRepository.getByAgentId(agentId);
        if (!config) {
            throw new HeartbeatConfigNotFoundError(agentId);
        }

        if (config.user_id !== userId) {
            throw new HeartbeatConfigAccessDeniedError(agentId);
        }

        return this.runHeartbeatOnce(agentId, 'manual');
    }
}

export const heartbeatRunnerService = new HeartbeatRunnerService();
