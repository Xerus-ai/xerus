// Background Jobs Index
// Centralized initialization for all scheduled jobs

import { startSyncPipedreamAppsJob } from './sync-pipedream-apps';
import { startSandboxSchedulerJob, startSandboxCleanupJob } from './sandbox-lifecycle';
import { startDigestSchedulerJob } from './digest-scheduler';
import { startBackupSchedulerJob } from './s3-backup-job';
import { startSnapshotWarmKeepJob } from './snapshot-warm-keep';
import { startExecutionWatchdogJob } from './execution-watchdog';
import { startCreditResetJob } from './credit-reset';
import { startStaleSessionCleanupJob } from './stale-session-cleanup';
import type { SandboxProvider } from '../domains/sandbox-infra/sandbox/providers';
import type { SandboxService } from '../domains/sandbox-infra/sandbox/sandbox.service';
import type { S3BackupService } from '../domains/sandbox-infra/storage/s3-backup.service';
import type { ExecutionDatabase } from '../domains/execution/execution-pipeline.types';
import { logger } from '../utils/logger';

const log = logger('Jobs');

export interface JobDependencies {
    provider?: SandboxProvider;
    sandboxService?: SandboxService;
    backupService?: S3BackupService;
    db?: ExecutionDatabase;
}

export function startAllJobs(deps: JobDependencies = {}): void {
    const enabled = process.env.ENABLE_CRON_JOBS !== 'false';

    if (!enabled) {
        log.info('Cron jobs disabled (ENABLE_CRON_JOBS=false)');
        return;
    }

    log.info('Initializing background jobs...');

    try {
        startSyncPipedreamAppsJob();
        startSandboxSchedulerJob(deps.provider, deps.sandboxService);
        startSandboxCleanupJob(deps.provider, deps.sandboxService);
        startSnapshotWarmKeepJob(deps.provider);
        startExecutionWatchdogJob();
        startCreditResetJob();
        startStaleSessionCleanupJob();
        startDigestSchedulerJob(deps.db);

        if (deps.sandboxService && deps.backupService) {
            startBackupSchedulerJob(deps.sandboxService, deps.backupService);
        } else {
            log.warn('Backup scheduler skipped (missing sandboxService or backupService)');
        }

        log.info('All jobs initialized successfully');
    } catch (error) {
        log.error('Failed to initialize jobs', error instanceof Error ? error : new Error(String(error)));
        throw error;
    }
}
