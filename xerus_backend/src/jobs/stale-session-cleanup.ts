import cron from 'node-cron';
import { query } from '../database/connection';
import { logger } from '../utils/logger';

const log = logger('StaleSessionCleanup');

const STALE_THRESHOLD_MINUTES = 30;

export function startStaleSessionCleanupJob(): void {
    cron.schedule('*/15 * * * *', async () => {
        try {
            const result = await query<{ id: string }>(
                `UPDATE execution_sessions
                 SET status = 'failed',
                     completed_at = NOW()
                 WHERE status = 'running'
                   AND started_at < NOW() - MAKE_INTERVAL(mins => $1)
                 RETURNING id`,
                [STALE_THRESHOLD_MINUTES],
            );

            const count = result.rowCount ?? 0;
            if (count > 0) {
                log.warn('Stale sessions cleaned up', { count, sessions: result.rows.map(r => r.id) });
            }
        } catch (error) {
            log.error('Stale session cleanup failed', error instanceof Error ? error : new Error(String(error)));
        }
    });

    log.info('Stale session cleanup job scheduled (every 15 minutes)');
}
