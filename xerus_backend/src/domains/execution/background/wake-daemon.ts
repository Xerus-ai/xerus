// Wake Daemon
// Scans sandbox_wake_schedule (Neon) for sandboxes with due schedules,
// wakes them via sandboxScheduler.wakeForHeartbeat(), then advances or
// clears next_wake_at. Runs as a 60s setInterval in the backend process.

import { query } from '../../../database/connection';
import type { SandboxService } from '../../sandbox-infra/sandbox/sandbox.service';
import { logger } from '../../../utils/logger';

const log = logger('WakeDaemon');

const WAKE_INTERVAL_MS = 60_000;

interface WakeRow {
    sandbox_id: string;
    user_id: string;
}

let timer: NodeJS.Timeout | null = null;
let _sandboxService: SandboxService | null = null;

async function tick(): Promise<void> {
    if (!_sandboxService) return;

    try {
        const result = await query<WakeRow>(
            `SELECT sandbox_id, user_id FROM sandbox_wake_schedule
             WHERE next_wake_at IS NOT NULL AND next_wake_at <= NOW()`,
        );

        if (result.rows.length === 0) return;

        log.info('Waking sandboxes with due schedules', { count: result.rows.length });

        for (const row of result.rows) {
            try {
                const status = await _sandboxService.getSandboxStatus(row.user_id);
                if (status.status === 'running') {
                    log.debug('Sandbox already running, clearing wake', { sandbox_id: row.sandbox_id });
                } else {
                    log.info('Waking sandbox for due schedule', { sandbox_id: row.sandbox_id, user_id: row.user_id });
                    await _sandboxService.getOrCreateSandbox({ userId: row.user_id });
                }

                // Clear next_wake_at — the 9to5 daemon inside the sandbox handles the actual firing.
                // It will be re-set when the schedule fires and advances next_run_at,
                // or when a new schedule is created/updated via schedule.tools.ts.
                await query(
                    `UPDATE sandbox_wake_schedule SET next_wake_at = NULL, updated_at = NOW()
                     WHERE sandbox_id = $1`,
                    [row.sandbox_id],
                );
            } catch (err) {
                log.error('Failed to wake sandbox', {
                    sandbox_id: row.sandbox_id,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
    } catch (err) {
        log.error('Wake daemon tick failed', {
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

export function startWakeDaemon(sandboxService: SandboxService): void {
    _sandboxService = sandboxService;
    timer = setInterval(tick, WAKE_INTERVAL_MS);
    log.info('Wake daemon started', { interval_ms: WAKE_INTERVAL_MS });
}

export function stopWakeDaemon(): void {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
    _sandboxService = null;
    log.info('Wake daemon stopped');
}

/**
 * Recompute and upsert the earliest next_wake_at for a sandbox.
 * Called by schedule routes after create/update/delete to keep the
 * alarm clock in sync. Queries workspace.db for the minimum next_run_at
 * across all active schedules.
 */
export async function recomputeWakeSchedule(
    sandboxId: string,
    userId: string,
    earliestNextRunEpoch: number | null,
): Promise<void> {
    const nextWakeAt = earliestNextRunEpoch
        ? new Date(earliestNextRunEpoch * 1000).toISOString()
        : null;

    await query(
        `INSERT INTO sandbox_wake_schedule (sandbox_id, user_id, next_wake_at, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (sandbox_id) DO UPDATE SET
             next_wake_at = $3,
             updated_at = NOW()`,
        [sandboxId, userId, nextWakeAt],
    );
}
