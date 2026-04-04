// Sandbox Scheduler Service (Wake/Sleep)
// Lightweight cron service managing sandbox wake/sleep lifecycle.
// Runs every 60 seconds to evaluate running sandboxes for sleep eligibility.
// Provides imperative wake methods for user messages, heartbeats, and events.

import { logger } from '../../../utils/logger';
import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';

const log = logger('SandboxScheduler');

// Configurable thresholds (constants, not DB config)
const DEFAULT_INACTIVITY_TIMEOUT_MINUTES = 4320; // 3 days
const TICK_CRON_EXPRESSION = '* * * * *'; // every 60 seconds

// ---- Database interface ----

export interface SchedulerDatabase {
    query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

// ---- DB row types (snake_case) ----

interface RunningSandboxRow {
    user_id: string;
    sandbox_id: string;
    status: string;
    last_activity_at: Date;
    active_execution_count: number;
}

// ---- Result types ----

export interface SleepEvalResult {
    evaluated: number;
    slept: number;
    skippedActiveExecution: number;
    skippedRecentActivity: number;
    errors: number;
}

export interface WakeResult {
    woken: boolean;
    sandboxId: string;
    reason?: string;
    error?: string;
    durationMs: number;
}

export interface SchedulerStats {
    running: boolean;
    tickCount: number;
    lastTickAt: Date | null;
    lastSleepEval: SleepEvalResult | null;
}

// ---- Dependency injection ----

export interface SandboxSchedulerDeps {
    db: SchedulerDatabase;
    wakeHandler: (sandboxId: string) => Promise<void>;
    sleepHandler: (sandboxId: string, userId: string) => Promise<void>;
    inactivityTimeoutMinutes?: number;
}

// ---- Service ----

export class SandboxSchedulerService {
    private cronTask: ScheduledTask | null = null;
    private running = false;
    private tickCount = 0;
    private lastTickAt: Date | null = null;
    private lastSleepEval: SleepEvalResult | null = null;

    private readonly db: SchedulerDatabase;
    private readonly wakeHandler: (sandboxId: string) => Promise<void>;
    private readonly sleepHandler: (sandboxId: string, userId: string) => Promise<void>;
    private readonly inactivityTimeoutMs: number;

    constructor(deps: SandboxSchedulerDeps) {
        this.db = deps.db;
        this.wakeHandler = deps.wakeHandler;
        this.sleepHandler = deps.sleepHandler;
        this.inactivityTimeoutMs =
            (deps.inactivityTimeoutMinutes ?? DEFAULT_INACTIVITY_TIMEOUT_MINUTES) * 60 * 1000;
    }

    start(): void {
        if (this.running) {
            return;
        }

        this.cronTask = cron.schedule(TICK_CRON_EXPRESSION, () => {
            this.tick().catch((err) => {
                log.error('Tick failed', { error: String(err instanceof Error ? err.message : err) });
            });
        });

        this.running = true;
        log.info('Started (tick every 60s)');
    }

    stop(): void {
        if (!this.running || !this.cronTask) {
            this.running = false;
            return;
        }

        this.cronTask.stop();
        this.cronTask = null;
        this.running = false;
        log.info('Stopped');
    }

    isRunning(): boolean {
        return this.running;
    }

    getStats(): SchedulerStats {
        return {
            running: this.running,
            tickCount: this.tickCount,
            lastTickAt: this.lastTickAt,
            lastSleepEval: this.lastSleepEval,
        };
    }

    // ---- Wake methods (imperative, called by backend on demand) ----

    async wakeForUser(_userId: string, sandboxId: string): Promise<WakeResult> {
        return this.wake(sandboxId, 'user_message');
    }

    async wakeForHeartbeat(
        _userId: string,
        sandboxId: string,
        _agentId: number
    ): Promise<WakeResult> {
        return this.wake(sandboxId, 'heartbeat_prewarm');
    }

    async wakeForEvent(
        _userId: string,
        sandboxId: string,
        _eventType: string
    ): Promise<WakeResult> {
        return this.wake(sandboxId, 'event');
    }

    // ---- Sleep evaluation (called every tick) ----

    async evaluateSleepCandidates(): Promise<SleepEvalResult> {
        const result: SleepEvalResult = {
            evaluated: 0,
            slept: 0,
            skippedActiveExecution: 0,
            skippedRecentActivity: 0,
            errors: 0,
        };

        const runningSandboxes = await this.fetchRunningSandboxes();
        result.evaluated = runningSandboxes.length;

        if (runningSandboxes.length === 0) {
            return result;
        }

        const now = Date.now();

        for (const sandbox of runningSandboxes) {
            // Condition 1: No active executions
            if (sandbox.active_execution_count > 0) {
                result.skippedActiveExecution++;
                continue;
            }

            // Condition 2: Inactive beyond threshold
            const lastActivity = new Date(sandbox.last_activity_at).getTime();
            const inactiveMs = now - lastActivity;
            if (inactiveMs < this.inactivityTimeoutMs) {
                result.skippedRecentActivity++;
                continue;
            }

            // All conditions met: put sandbox to sleep
            try {
                await this.sleepHandler(sandbox.sandbox_id, sandbox.user_id);
                result.slept++;
                log.info('Slept sandbox', { sandbox_id: sandbox.sandbox_id, user_id: sandbox.user_id, inactive_min: Math.round(inactiveMs / 60000) });
            } catch (err) {
                result.errors++;
                log.error('Failed to sleep sandbox', { sandbox_id: sandbox.sandbox_id, error: String(err instanceof Error ? err.message : err) });
            }
        }

        return result;
    }

    // ---- Internal ----

    private async tick(): Promise<void> {
        this.tickCount++;
        this.lastTickAt = new Date();

        const sleepResult = await this.evaluateSleepCandidates();
        this.lastSleepEval = sleepResult;

        if (sleepResult.slept > 0 || sleepResult.errors > 0) {
            log.info('Tick summary', { tick: this.tickCount, evaluated: sleepResult.evaluated, slept: sleepResult.slept, errors: sleepResult.errors });
        }
    }

    private async wake(sandboxId: string, reason: string): Promise<WakeResult> {
        const startTime = Date.now();

        try {
            await this.wakeHandler(sandboxId);
            log.info('Woke sandbox', { sandbox_id: sandboxId, reason });
            return {
                woken: true,
                sandboxId,
                reason,
                durationMs: Date.now() - startTime,
            };
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            log.error('Failed to wake sandbox', { sandbox_id: sandboxId, error: errorMsg });
            return {
                woken: false,
                sandboxId,
                reason,
                error: errorMsg,
                durationMs: Date.now() - startTime,
            };
        }
    }

    private async fetchRunningSandboxes(): Promise<RunningSandboxRow[]> {
        const result = await this.db.query<RunningSandboxRow>(
            `SELECT user_id, sandbox_id,
                    sandbox_status AS status,
                    sandbox_last_activity_at AS last_activity_at,
                    sandbox_active_execution_count AS active_execution_count
             FROM workspaces
             WHERE sandbox_status = 'running'`
        );
        return result.rows;
    }

}
