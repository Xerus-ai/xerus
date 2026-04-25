// Background Job: Snapshot Warm-Keep
// Runs weekly to defeat Daytona's idle-GC. If the configured sandbox snapshot
// has been auto-deactivated (~14 days without sandbox creations), re-activate
// it before a user runs into "Snapshot xerus-sandbox is inactive". Combined
// with the in-line self-heal in DaytonaProvider.create, this gives two layers
// of protection: prevention + recovery.

import cron from 'node-cron';
import type { SandboxProvider } from '../domains/sandbox-infra/sandbox/providers';
import { DaytonaProvider } from '../domains/sandbox-infra/sandbox/providers/daytona.provider';
import { SANDBOX_CONFIG } from '../domains/sandbox-infra/sandbox/sandbox.config';
import { logger } from '../utils/logger';

const log = logger('Job:SnapshotWarmKeep');

// Weekly: every Monday at 04:00 UTC
const CRON_SCHEDULE = '0 4 * * 1';

export function startSnapshotWarmKeepJob(provider?: SandboxProvider): void {
    if (!(provider instanceof DaytonaProvider)) {
        log.info('Skipped (provider is not Daytona)');
        return;
    }
    if (!SANDBOX_CONFIG.snapshot) {
        log.warn('Skipped (DAYTONA_SNAPSHOT not configured)');
        return;
    }

    const snapshotName = SANDBOX_CONFIG.snapshot;
    log.info('Scheduling job', { cron: CRON_SCHEDULE, snapshot: snapshotName });

    cron.schedule(CRON_SCHEDULE, async () => {
        try {
            await provider.ensureSnapshotActive(snapshotName);
            log.info('Snapshot verified active', { snapshot: snapshotName });
        } catch (error) {
            log.error('Warm-keep failed', error instanceof Error ? error : new Error(String(error)));
        }
    });

    log.info('Job scheduled successfully');
}
