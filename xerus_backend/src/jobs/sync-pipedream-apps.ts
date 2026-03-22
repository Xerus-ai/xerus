// Background Job: Sync Pipedream Apps Cache
// Runs daily at 3 AM to keep the apps cache up-to-date

import cron from 'node-cron';
import { toolsService } from '../domains/tools/service';

const CRON_SCHEDULE = '0 3 * * *';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 60000;

async function syncWithRetry(retryCount = 0): Promise<void> {
    try {
        console.log(`[Job:SyncPipedreamApps] Starting sync attempt ${retryCount + 1}/${MAX_RETRIES}...`);
        const result = await toolsService.syncPipedreamApps();
        console.log(`[Job:SyncPipedreamApps] Success:`, result);
    } catch (error) {
        console.error(`[Job:SyncPipedreamApps] Attempt ${retryCount + 1} failed:`, error);

        if (retryCount < MAX_RETRIES - 1) {
            console.log(`[Job:SyncPipedreamApps] Retrying in ${RETRY_DELAY_MS / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            await syncWithRetry(retryCount + 1);
        } else {
            console.error(`[Job:SyncPipedreamApps] Max retries reached. Giving up.`);
        }
    }
}

export function startSyncPipedreamAppsJob(): void {
    console.log(`[Job:SyncPipedreamApps] Scheduling job: ${CRON_SCHEDULE}`);

    cron.schedule(CRON_SCHEDULE, async () => {
        console.log(`[Job:SyncPipedreamApps] Triggered at ${new Date().toISOString()}`);
        await syncWithRetry();
    });

    console.log('[Job:SyncPipedreamApps] Job scheduled successfully');
}
