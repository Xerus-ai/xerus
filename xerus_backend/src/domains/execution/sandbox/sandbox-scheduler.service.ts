// Sandbox Scheduler Service (Wake/Sleep)
// Lightweight cron service managing sandbox wake/sleep lifecycle.
// Runs every 60 seconds to evaluate running sandboxes for sleep eligibility.
// Provides imperative wake methods for user messages, heartbeats, and events.

import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';

// Configurable thresholds (constants, not DB config)
const DEFAULT_INACTIVITY_TIMEOUT_MINUTES = 4320; // 3 days
const DEFAULT_HEARTBEAT_PROXIMITY_MINUTES = 30;
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

interface HeartbeatScheduleRow {
    agent_id: number;
    next_scheduled_at: Date;
}

// ---- Result types ----

export interface SleepEvalResult {
    evaluated: number;
    slept: number;
    skippedActiveExecution: number;
    skippedRecentActivity: number;
    skippedHeartbeatProximity: number;
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
    sleepHandler: (sandboxId: string, userId?: string) => Promise<void>;
    inactivityTimeoutMinutes?: number;
    heartbeatProximityMinutes?: number;
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
    private readonly sleepHandler: (sandboxId: string, userId?: string) => Promise<void>;
    private readonly inactivityTimeoutMs: number;
    private readonly heartbeatProximityMs: number;

    constructor(deps: SandboxSchedulerDeps) {
        this.db = deps.db;
        this.wakeHandler = deps.wakeHandler;
        this.sleepHandler = deps.sleepHandler;
        this.inactivityTimeoutMs =
            (deps.inactivityTimeoutMinutes ?? DEFAULT_INACTIVITY_TIMEOUT_MINUTES) * 60 * 1000;
        this.heartbeatProximityMs =
            (deps.heartbeatProximityMinutes ?? DEFAULT_HEARTBEAT_PROXIMITY_MINUTES) * 60 * 1000;
    }

    start(): void {
        if (this.running) {
            return;
        }

        this.cronTask = cron.schedule(TICK_CRON_EXPRESSION, () => {
            this.tick().catch((err) => {
                console.error(
                    '[SandboxScheduler] Tick failed:',
                    err instanceof Error ? err.message : err
                );
            });
        });

        this.running = true;
        console.log('[SandboxScheduler] Started (tick every 60s)');
    }

    stop(): void {
        if (!this.running || !this.cronTask) {
            this.running = false;
            return;
        }

        this.cronTask.stop();
        this.cronTask = null;
        this.running = false;
        console.log('[SandboxScheduler] Stopped');
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
            skippedHeartbeatProximity: 0,
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

            // Condition 3: No heartbeats scheduled within proximity window
            const hasUpcomingHeartbeat = await this.hasHeartbeatWithinWindow(
                sandbox.user_id,
                now,
                this.heartbeatProximityMs
            );
            if (hasUpcomingHeartbeat) {
                result.skippedHeartbeatProximity++;
                continue;
            }

            // All conditions met: put sandbox to sleep
            try {
                await this.sleepHandler(sandbox.sandbox_id, sandbox.user_id);
                result.slept++;
                console.log(
                    `[SandboxScheduler] Slept sandbox ${sandbox.sandbox_id} ` +
                    `for user ${sandbox.user_id} (inactive ${Math.round(inactiveMs / 60000)}min)`
                );
            } catch (err) {
                result.errors++;
                console.error(
                    `[SandboxScheduler] Failed to sleep sandbox ${sandbox.sandbox_id}:`,
                    err instanceof Error ? err.message : err
                );
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
            console.log(
                `[SandboxScheduler] Tick #${this.tickCount}: ` +
                `evaluated=${sleepResult.evaluated}, slept=${sleepResult.slept}, ` +
                `errors=${sleepResult.errors}`
            );
        }
    }

    private async wake(sandboxId: string, reason: string): Promise<WakeResult> {
        const startTime = Date.now();

        try {
            await this.wakeHandler(sandboxId);
            console.log(
                `[SandboxScheduler] Woke sandbox ${sandboxId} (reason: ${reason})`
            );
            return {
                woken: true,
                sandboxId,
                reason,
                durationMs: Date.now() - startTime,
            };
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error(
                `[SandboxScheduler] Failed to wake sandbox ${sandboxId}: ${errorMsg}`
            );
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

    private async hasHeartbeatWithinWindow(
        userId: string,
        _nowMs: number,
        windowMs: number
    ): Promise<boolean> {
        const result = await this.db.query<HeartbeatScheduleRow>(
            `SELECT hs.agent_id, hs.next_scheduled_at
             FROM heartbeat_state hs
             JOIN heartbeat_configs hc ON hc.agent_id = hs.agent_id
             WHERE hc.user_id = $1
               AND hc.enabled = true
               AND hs.next_scheduled_at IS NOT NULL
               AND hs.next_scheduled_at <= NOW() + ($2 || ' milliseconds')::interval`,
            [userId, windowMs]
        );
        return result.rows.length > 0;
    }
}
