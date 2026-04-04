// Background Job: Sync Pipedream Apps Cache
// Runs daily at 3 AM to keep the apps cache up-to-date

import cron from 'node-cron';
import { toolsService } from '../domains/tools/service';
import { logger } from '../utils/logger';

const log = logger('Job:SyncPipedreamApps');

const CRON_SCHEDULE = '0 3 * * *';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 60000;

async function syncWithRetry(retryCount = 0): Promise<void> {
    try {
        log.info('Starting sync attempt', { attempt: retryCount + 1, max_retries: MAX_RETRIES });
        const result = await toolsService.syncPipedreamApps();
        log.info('Sync succeeded', { synced: result.synced, failed: result.failed, duration_ms: result.duration_ms });
    } catch (error) {
        log.error('Sync attempt failed', { attempt: retryCount + 1, error: error instanceof Error ? error.message : String(error) });

        if (retryCount < MAX_RETRIES - 1) {
            log.info('Retrying', { delay_seconds: RETRY_DELAY_MS / 1000 });
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            await syncWithRetry(retryCount + 1);
        } else {
            log.error('Max retries reached, giving up');
        }
    }
}

export function startSyncPipedreamAppsJob(): void {
    log.info('Scheduling job', { cron: CRON_SCHEDULE });

    cron.schedule(CRON_SCHEDULE, async () => {
        log.info('Job triggered');
        await syncWithRetry();
    });

    log.info('Job scheduled successfully');
}
