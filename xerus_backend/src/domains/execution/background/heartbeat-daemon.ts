// Heartbeat Scheduler Daemon
// Polls each running sandbox's workspace.db `schedules` table for due recurring
// automations (status='active', next_run_at <= now) and triggers agent
// executions through the execution pipeline with trigger_type='schedule'.
// Advances next_run_at via the schedule's rrule so each schedule fires on its
// cadence, and records every run in `schedule_runs`. One failed schedule never
// blocks the others — each is wrapped in its own error boundary.
//
// Sandbox enumeration uses SandboxService.getActiveSessions() (in-memory running
// sandboxes). Schedules on paused sandboxes fire once their sandbox is resumed;
// the daemon does not wake sandboxes (that would defeat the pause-to-save model).

import { randomUUID } from 'crypto';
import type { SandboxService } from '../../sandbox-infra/sandbox/sandbox.service';
import type { DaytonaProvider } from '../../sandbox-infra/sandbox/providers/daytona.provider';
import type { ExecutionService } from '../execution.service';
import type { ScheduleEntry } from '../../platform-tools/platform/platform-tool.inlined-types';
import {
    executeWorkspaceQuery,
    executeWorkspaceJsonQuery,
    escapeSQL,
} from '../../conversations/workspace-db.helpers';
import { computeNextRunAt } from '../../platform-tools/platform/tools/schedule.tools';
import { NullStreamingResponse } from '../streaming/stream.handler';
import { logger } from '../../../utils/logger';

const log = logger('HeartbeatDaemon');

const DEFAULT_INTERVAL_MS = 30_000;

export interface HeartbeatDaemonDeps {
    sandboxService: SandboxService;
    executionService: ExecutionService;
    intervalMs?: number;
}

function nowEpochSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

export class HeartbeatDaemon {
    private timer: NodeJS.Timeout | null = null;
    private polling = false;
    // Schedule ids with an execution still in flight — prevents stacking runs
    // when an execution outlives its interval (e.g. a MINUTELY schedule whose
    // agent takes several minutes). The claimed run fires once it finishes.
    private readonly inFlight = new Set<string>();
    private readonly deps: HeartbeatDaemonDeps;
    private readonly intervalMs: number;

    constructor(deps: HeartbeatDaemonDeps) {
        this.deps = deps;
        this.intervalMs = deps.intervalMs && deps.intervalMs > 0 ? deps.intervalMs : DEFAULT_INTERVAL_MS;
    }

    start(): void {
        if (this.timer) return;
        log.info('Starting heartbeat daemon', { interval_ms: this.intervalMs });
        this.timer = setInterval(() => { void this.tick(); }, this.intervalMs);
        // The express server keeps the process alive; the poller alone should not.
        this.timer.unref?.();
    }

    stop(): void {
        if (!this.timer) return;
        clearInterval(this.timer);
        this.timer = null;
        log.info('Stopped heartbeat daemon');
    }

    isRunning(): boolean {
        return this.timer !== null;
    }

    // One poll cycle. Guarded so a slow cycle never overlaps the next tick.
    async tick(): Promise<void> {
        if (this.polling) {
            log.debug('Skipping tick — previous poll still running');
            return;
        }
        this.polling = true;
        try {
            const sessions = this.deps.sandboxService.getActiveSessions();
            for (const session of sessions) {
                try {
                    await this.processSandbox(session.userId, session.sandboxId);
                } catch (err) {
                    log.error('Failed to process sandbox schedules', {
                        user_id: session.userId,
                        sandbox_id: session.sandboxId,
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            }
        } finally {
            this.polling = false;
        }
    }

    private async processSandbox(userId: string, sandboxId: string): Promise<void> {
        const provider = this.deps.sandboxService.getDaytonaProvider();
        const now = nowEpochSeconds();
        const dueSql = `SELECT * FROM schedules
            WHERE status = 'active'
              AND rrule IS NOT NULL
              AND next_run_at IS NOT NULL
              AND next_run_at <= ${now}
            ORDER BY next_run_at ASC;`;

        const due = await executeWorkspaceJsonQuery<ScheduleEntry>(provider, sandboxId, dueSql);
        if (due.length === 0) return;

        log.info('Due schedules found', { user_id: userId, sandbox_id: sandboxId, count: due.length });

        for (const schedule of due) {
            try {
                await this.fireSchedule(userId, sandboxId, provider, schedule);
            } catch (err) {
                log.error('Failed to fire schedule', {
                    schedule_id: schedule.id,
                    schedule_name: schedule.name,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }

    private async fireSchedule(
        userId: string,
        sandboxId: string,
        provider: DaytonaProvider,
        schedule: ScheduleEntry,
    ): Promise<void> {
        if (this.inFlight.has(schedule.id)) {
            log.debug('Schedule still executing, skipping this tick', { schedule_id: schedule.id });
            return;
        }
        if (!schedule.rrule) return; // guarded by the query; defensive

        // Compute the next occurrence BEFORE triggering. A throw here (corrupt
        // rrule) propagates to the per-schedule error boundary in processSandbox,
        // which logs and skips without triggering an execution.
        const nextRunAt = computeNextRunAt(schedule.rrule);
        const now = nowEpochSeconds();

        // Claim the schedule: advance next_run_at (NULL when the rule has no
        // further occurrences) and stamp last_run_at. This must happen before
        // triggering so the next poll does not re-fire this same occurrence.
        const nextRunAtSql = nextRunAt != null ? String(nextRunAt) : 'NULL';
        await executeWorkspaceQuery(
            provider,
            sandboxId,
            `UPDATE schedules SET next_run_at = ${nextRunAtSql}, last_run_at = ${now}, updated_at = ${now}
             WHERE id = '${escapeSQL(schedule.id)}';`,
        );

        const runId = randomUUID();
        await executeWorkspaceQuery(
            provider,
            sandboxId,
            `INSERT INTO schedule_runs (id, schedule_id, status, started_at, created_at)
             VALUES ('${runId}', '${escapeSQL(schedule.id)}', 'running', ${now}, ${now});`,
        );

        this.inFlight.add(schedule.id);
        log.info('Triggering scheduled execution', {
            schedule_id: schedule.id,
            schedule_name: schedule.name,
            agent_slug: schedule.agent_slug,
            user_id: userId,
            run_id: runId,
            next_run_at: nextRunAt,
        });

        // Fire the execution without blocking the poll loop, then close out the
        // run-history row. Errors are captured on the run row, not thrown here.
        const startedAtMs = Date.now();
        void this.deps.executionService
            .startExecution({
                request: {
                    agentSlug: schedule.agent_slug,
                    task: schedule.prompt,
                    userId,
                    context: {
                        trigger: 'schedule',
                        schedule_id: schedule.id,
                        schedule_name: schedule.name,
                    },
                },
                stream: new NullStreamingResponse(),
                triggerType: 'schedule',
            })
            .then(() => this.completeRun(provider, sandboxId, runId, 'completed', Date.now() - startedAtMs, null))
            .catch((err: unknown) => {
                const msg = err instanceof Error ? err.message : String(err);
                log.error('Scheduled execution failed', { schedule_id: schedule.id, run_id: runId, error: msg });
                return this.completeRun(provider, sandboxId, runId, 'failed', Date.now() - startedAtMs, msg);
            })
            .finally(() => {
                this.inFlight.delete(schedule.id);
            });
    }

    private async completeRun(
        provider: DaytonaProvider,
        sandboxId: string,
        runId: string,
        status: 'completed' | 'failed',
        durationMs: number,
        error: string | null,
    ): Promise<void> {
        const now = nowEpochSeconds();
        const errorSql = error != null ? `'${escapeSQL(error)}'` : 'NULL';
        try {
            await executeWorkspaceQuery(
                provider,
                sandboxId,
                `UPDATE schedule_runs SET status = '${status}', completed_at = ${now}, duration_ms = ${durationMs}, error = ${errorSql}
                 WHERE id = '${runId}';`,
            );
        } catch (err) {
            log.warn('Failed to record schedule run completion', {
                run_id: runId,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
}

// -----------------------------------------------------------------------------
// Process-level lifecycle (wired from index.ts)
// -----------------------------------------------------------------------------

let daemonInstance: HeartbeatDaemon | null = null;

export function startHeartbeatDaemon(deps: HeartbeatDaemonDeps): HeartbeatDaemon {
    if (daemonInstance) {
        log.warn('Heartbeat daemon already started');
        return daemonInstance;
    }
    const envRaw = process.env.HEARTBEAT_INTERVAL_MS;
    const envInterval = envRaw ? Number(envRaw) : NaN;
    const intervalMs = deps.intervalMs ?? (Number.isFinite(envInterval) && envInterval > 0 ? envInterval : undefined);

    daemonInstance = new HeartbeatDaemon({ ...deps, intervalMs });
    daemonInstance.start();
    return daemonInstance;
}

export function stopHeartbeatDaemon(): void {
    if (!daemonInstance) return;
    daemonInstance.stop();
    daemonInstance = null;
}
