// Background Job: Execution Watchdog
// Finalises execution_sessions rows that are stuck in pending/running past a
// safety threshold. The runner inside a sandbox is supposed to write a
// terminal status (completed/failed/cancelled) when it finishes -- if it
// crashes mid-execution (sandbox OOM, network blip, runtime missing, deploy
// restart, Daytona losing the sandbox) the row remains "running" forever and
// the UI shows a phantom in-flight execution. This job is the safety net.
//
// Treats any execution older than EXECUTION_TIMEOUT_MINUTES still in
// pending/running as a failed timeout. Set the threshold longer than the
// longest legitimate execution to avoid false positives. paused executions
// are intentionally excluded -- those are user-initiated waits, not zombies.

import cron from 'node-cron';
import { query } from '../database/connection';
import { logger } from '../utils/logger';

const log = logger('Job:ExecutionWatchdog');

// Every 5 minutes
const CRON_SCHEDULE = '*/5 * * * *';

// Anything older than this still in pending/running gets reaped
const EXECUTION_TIMEOUT_MINUTES = 30;

interface ReapedRow {
    id: string;
    agent_slug: string;
    age_minutes: number;
}

async function reapStuckExecutions(): Promise<void> {
    const result = await query<ReapedRow>(
        `UPDATE execution_sessions
         SET status = 'failed',
             completed_at = NOW(),
             message_metadata = COALESCE(message_metadata, '{}'::jsonb) || jsonb_build_object(
                 'failure_reason', 'watchdog_timeout',
                 'failure_note', 'Watchdog finalised after exceeding timeout without writing terminal status',
                 'timeout_minutes', $1::int,
                 'finalised_at', NOW()
             )
         WHERE status IN ('pending', 'running')
           AND created_at < NOW() - make_interval(mins => $1::int)
         RETURNING id, agent_slug,
                   EXTRACT(EPOCH FROM (NOW() - created_at))::int / 60 AS age_minutes`,
        [EXECUTION_TIMEOUT_MINUTES],
    );

    if (result.rows.length === 0) {
        log.debug('No stuck executions');
        return;
    }

    log.warn('Reaped stuck executions', {
        count: result.rows.length,
        timeout_minutes: EXECUTION_TIMEOUT_MINUTES,
        rows: result.rows.map(r => ({ id: r.id, agent_slug: r.agent_slug, age_minutes: r.age_minutes })),
    });
}

export function startExecutionWatchdogJob(): void {
    log.info('Scheduling job', { cron: CRON_SCHEDULE, timeout_minutes: EXECUTION_TIMEOUT_MINUTES });

    cron.schedule(CRON_SCHEDULE, async () => {
        try {
            await reapStuckExecutions();
        } catch (error) {
            log.error('Watchdog tick failed', error instanceof Error ? error : new Error(String(error)));
        }
    });

    log.info('Job scheduled successfully');
}
