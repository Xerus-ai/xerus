// Background Job: Sandbox Lifecycle Management
// - Scheduler: evaluates sleep candidates every 60s (via SandboxSchedulerService)
// - Cleanup: kills stale/orphaned sandboxes every 6 hours (via LifecycleCleanupService)

import cron from 'node-cron';
import { query } from '../database/connection';
import { SandboxSchedulerService } from '../domains/execution/sandbox/sandbox-scheduler.service';
import { LifecycleCleanupService } from '../domains/execution/sandbox/lifecycle-cleanup.service';
import type { SandboxProvider } from '../domains/execution/sandbox/providers';

// Typed query wrapper matching SchedulerDatabase interface
async function typedQuery<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
    const result = await query(sql, params);
    return { rows: result.rows as T[] };
}

// -----------------------------------------------------------------------------
// Sandbox Scheduler (Wake/Sleep)
// -----------------------------------------------------------------------------

let schedulerInstance: SandboxSchedulerService | null = null;

export function startSandboxSchedulerJob(provider?: SandboxProvider): void {
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
        sleepHandler: async (sandboxId: string) => {
            if (provider) {
                await provider.pause(sandboxId);
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

export function startSandboxCleanupJob(provider?: SandboxProvider): void {
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
            async updateSandboxStatus(sandboxId: string, status: string, _userId?: string) {
                // Registry cache invalidation not needed here: cleanup targets sandboxes
                // idle for 24h+, and the 3-second TTL self-heals before any active query.
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
            async kill(sandboxId: string) {
                if (provider) {
                    await provider.kill(sandboxId);
                }
                console.log(`[Job:SandboxCleanup] Killed sandbox ${sandboxId}`);
            },
        },
        userLookup: {
            async getActiveUserIds() {
                const result = await query<{ firebase_uid: string }>(
                    `SELECT firebase_uid FROM users WHERE status = 'active'`
                );
                return result.rows.map((r: { firebase_uid: string }) => r.firebase_uid);
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
