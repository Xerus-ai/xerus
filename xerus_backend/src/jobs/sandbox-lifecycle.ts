// Background Job: Sandbox Lifecycle Management
// - Scheduler: evaluates sleep candidates every 60s (via SandboxSchedulerService)
// - Cleanup: pauses stale sandboxes, kills orphaned (deactivated users) every 6h

import cron from 'node-cron';
import { query } from '../database/connection';
import { SandboxSchedulerService } from '../domains/execution/sandbox/sandbox-scheduler.service';
import { LifecycleCleanupService } from '../domains/execution/sandbox/lifecycle-cleanup.service';
import type { SandboxProvider } from '../domains/execution/sandbox/providers';
import type { SandboxService } from '../domains/execution/sandbox/sandbox.service';

// Typed query wrapper matching SchedulerDatabase interface
async function typedQuery<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
    const result = await query(sql, params);
    return { rows: result.rows as T[] };
}

// -----------------------------------------------------------------------------
// Sandbox Scheduler (Wake/Sleep)
// -----------------------------------------------------------------------------

let schedulerInstance: SandboxSchedulerService | null = null;

export function startSandboxSchedulerJob(provider?: SandboxProvider, sandboxService?: SandboxService): void {
    if (schedulerInstance) {
        return;
    }

    schedulerInstance = new SandboxSchedulerService({
        db: { query: typedQuery },
        wakeHandler: async (sandboxId: string) => {
            if (provider) {
                await provider.connect(sandboxId);
            }
            console.log(`[Job:SandboxScheduler] Wake completed for ${sandboxId}`);
        },
        sleepHandler: async (sandboxId: string, userId: string) => {
            if (provider) {
                await provider.pause(sandboxId);
            }
            if (sandboxService) {
                sandboxService.clearCachedSession(userId);
            }
            console.log(`[Job:SandboxScheduler] Sleep completed for ${sandboxId}`);
        },
    });

    schedulerInstance.start();
    console.log('[Job:SandboxScheduler] Started');
}

// -----------------------------------------------------------------------------
// Lifecycle Cleanup (Stale + Orphan + Stuck sessions)
// Runs every 6 hours
// - Stale sandboxes (idle 24h+): PAUSED (paid users keep their Pod)
// - Orphaned sandboxes (deactivated users): KILLED (reclaim resources)
// -----------------------------------------------------------------------------

interface RegistryRow {
    sandbox_id: string;
    user_id: string;
    status: string;
    last_activity_at: Date;
}

interface SessionRow {
    id: string;
    status: string;
    started_at: Date;
}

const CLEANUP_CRON_SCHEDULE = '0 */6 * * *';

export function startSandboxCleanupJob(provider?: SandboxProvider, sandboxService?: SandboxService): void {
    const cleanupService = new LifecycleCleanupService({
        database: {
            async findStaleSandboxes(idleThresholdMs: number) {
                const result = await query<RegistryRow>(
                    `SELECT sandbox_id, user_id, sandbox_status AS status, sandbox_last_activity_at AS last_activity_at
                     FROM workspaces
                     WHERE sandbox_status = 'running'
                       AND sandbox_last_activity_at < NOW() - make_interval(secs => $1::numeric / 1000)`,
                    [idleThresholdMs]
                );
                return result.rows;
            },
            async findLongPausedSandboxes(pausedThresholdMs: number) {
                const result = await query<RegistryRow>(
                    `SELECT sandbox_id, user_id, sandbox_status AS status, sandbox_last_activity_at AS last_activity_at
                     FROM workspaces
                     WHERE sandbox_status = 'paused'
                       AND sandbox_paused_at < NOW() - make_interval(secs => $1::numeric / 1000)`,
                    [pausedThresholdMs]
                );
                return result.rows;
            },
            async findOrphanedSandboxes(activeUserIds: string[]) {
                if (activeUserIds.length === 0) {
                    const result = await query<RegistryRow>(
                        `SELECT sandbox_id, user_id, sandbox_status AS status, sandbox_last_activity_at AS last_activity_at
                         FROM workspaces WHERE sandbox_status = 'running'`
                    );
                    return result.rows;
                }
                const result = await query<RegistryRow>(
                    `SELECT sandbox_id, user_id, sandbox_status AS status, sandbox_last_activity_at AS last_activity_at
                     FROM workspaces
                     WHERE sandbox_status = 'running'
                       AND user_id != ALL($1)`,
                    [activeUserIds]
                );
                return result.rows;
            },
            async findStuckSessions(stuckThresholdMs: number) {
                const result = await query<SessionRow>(
                    `SELECT id, status, started_at
                     FROM execution_sessions
                     WHERE status = 'running'
                       AND started_at < NOW() - make_interval(secs => $1::numeric / 1000)`,
                    [stuckThresholdMs]
                );
                return result.rows;
            },
            // Registry cache invalidation handled by SandboxService.clearCachedSession() in kill/pause handlers.
            // The 3-second registry TTL also self-heals before any active query.
            async updateSandboxStatus(sandboxId: string, status: string, _userId?: string) {
                await query(
                    `UPDATE workspaces SET sandbox_status = $1, sandbox_last_activity_at = NOW(), updated_at = NOW()
                     WHERE sandbox_id = $2`,
                    [status, sandboxId]
                );
            },
            async updateSessionStatus(sessionId: string, status: string) {
                await query(
                    `UPDATE execution_sessions SET status = $1, completed_at = NOW() WHERE id = $2`,
                    [status, sessionId]
                );
            },
        },
        sandboxKiller: {
            async kill(sandboxId: string, userId: string) {
                if (provider) {
                    await provider.kill(sandboxId);
                }
                if (sandboxService) {
                    sandboxService.clearCachedSession(userId);
                }
                console.log(`[Job:SandboxCleanup] Killed sandbox ${sandboxId}`);
            },
            async pause(sandboxId: string, userId: string) {
                if (provider) {
                    await provider.pause(sandboxId);
                }
                if (sandboxService) {
                    sandboxService.clearCachedSession(userId);
                }
                console.log(`[Job:SandboxCleanup] Paused sandbox ${sandboxId}`);
            },
        },
        userLookup: {
            async getActiveUserIds() {
                const result = await query<{ user_id: string }>(
                    `SELECT user_id FROM users WHERE is_active = true`
                );
                return result.rows.map((r: { user_id: string }) => r.user_id);
            },
        },
    });

    cron.schedule(CLEANUP_CRON_SCHEDULE, async () => {
        console.log('[Job:SandboxCleanup] Starting cleanup...');
        const result = await cleanupService.runFullCleanup();
        console.log('[Job:SandboxCleanup] Result:', JSON.stringify(result));
    });

    console.log('[Job:SandboxCleanup] Scheduled (every 6 hours)');
}
