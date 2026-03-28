// Background Jobs Index
// Centralized initialization for all scheduled jobs

import { startSyncPipedreamAppsJob } from './sync-pipedream-apps';
import { startSandboxSchedulerJob, startSandboxCleanupJob } from './sandbox-lifecycle';
import { startHeartbeatSchedulerJob } from './heartbeat-scheduler';
import { startDigestSchedulerJob } from './digest-scheduler';
import { startBackupSchedulerJob } from './s3-backup-job';
import type { SandboxProvider } from '../domains/execution/sandbox/providers';
import type { SandboxService } from '../domains/execution/sandbox/sandbox.service';
import type { S3BackupService } from '../domains/execution/storage/s3-backup.service';
import type { ExecutionDatabase } from '../domains/execution/execution-pipeline.types';

export interface JobDependencies {
    provider?: SandboxProvider;
    sandboxService?: SandboxService;
    backupService?: S3BackupService;
    db?: ExecutionDatabase;
}

export function startAllJobs(deps: JobDependencies = {}): void {
    const enabled = process.env.ENABLE_CRON_JOBS !== 'false';

    if (!enabled) {
        console.log('[Jobs] Cron jobs disabled (ENABLE_CRON_JOBS=false)');
        return;
    }

    console.log('[Jobs] Initializing background jobs...');

    try {
        startSyncPipedreamAppsJob();
        startSandboxSchedulerJob(deps.provider, deps.sandboxService);
        startSandboxCleanupJob(deps.provider, deps.sandboxService);
        if (deps.sandboxService && deps.db) {
            startHeartbeatSchedulerJob(deps.sandboxService, deps.db);
        } else {
            console.warn('[Jobs] Heartbeat scheduler skipped (missing sandboxService or db)');
        }
        startDigestSchedulerJob(deps.db);

        if (deps.sandboxService && deps.backupService) {
            startBackupSchedulerJob(deps.sandboxService, deps.backupService);
        } else {
            console.warn('[Jobs] Backup scheduler skipped (missing sandboxService or backupService)');
        }

        console.log('[Jobs] All jobs initialized successfully');
    } catch (error) {
        console.error('[Jobs] Failed to initialize jobs:', error);
        throw error;
    }
}
