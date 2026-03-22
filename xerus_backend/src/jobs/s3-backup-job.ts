// Background Job: Workspace Backup Scheduler
// Periodic tar.gz snapshots of user workspaces to S3 for disaster recovery.
// Daytona volumes handle stop/restart persistence; S3 covers VPS death.
// Reference: docs/planning/execution/daytona-first-workspace.md (Backup Strategy)

import cron from 'node-cron';
import { query } from '../database/connection';
import { SANDBOX_CONFIG, BACKUP_TAR_EXCLUDE_FLAGS } from '../domains/execution/sandbox/sandbox.config';
import type { SandboxService } from '../domains/execution/sandbox/sandbox.service';
import type { S3BackupService } from '../domains/execution/storage/s3-backup.service';
import type { DaytonaProvider } from '../domains/execution/sandbox/providers/daytona.provider';

const TAR_TEMP_PATH = '/tmp/workspace-backup.tar.gz';

// Default: every 2 hours (free tier). Override with BACKUP_CRON env var.
// Plan tiers: Free=2h, Pro=30min, Enterprise=5min
const DEFAULT_CRON = '0 */2 * * *';

interface SandboxRow {
    sandbox_id: string;
    user_id: string;
}

let backupTask: ReturnType<typeof cron.schedule> | null = null;

async function backupSingleWorkspace(
    provider: DaytonaProvider,
    backupService: S3BackupService,
    sandbox: SandboxRow,
): Promise<void> {
    const workspacePath = SANDBOX_CONFIG.workspacePath;

    const tarResult = await provider.executeCommand(
        sandbox.sandbox_id,
        `tar czf ${TAR_TEMP_PATH} -C ${workspacePath} ${BACKUP_TAR_EXCLUDE_FLAGS} . 2>/dev/null`,
    );
    if (tarResult.exitCode !== 0) {
        throw new Error(`tar failed for user ${sandbox.user_id}: ${tarResult.result}`);
    }

    const base64Result = await provider.executeCommand(
        sandbox.sandbox_id,
        `base64 -w 0 ${TAR_TEMP_PATH}`,
    );
    if (base64Result.exitCode !== 0) {
        throw new Error(`base64 read failed for user ${sandbox.user_id}: ${base64Result.result}`);
    }

    await provider.executeCommand(sandbox.sandbox_id, `rm -f ${TAR_TEMP_PATH}`);

    const content = Buffer.from(base64Result.result.trim(), 'base64');
    const result = await backupService.createSnapshot(sandbox.user_id, content);
    console.log(`[Job:Backup] Snapshot for user ${sandbox.user_id}: ${result.snapshotKey} (${result.sizeBytes} bytes)`);
}

async function runBackupCycle(
    sandboxService: SandboxService,
    backupService: S3BackupService,
): Promise<void> {
    console.log('[Job:Backup] Starting workspace backup cycle...');

    const { rows: sandboxes } = await query<SandboxRow>(
        `SELECT sandbox_id, user_id FROM workspaces WHERE sandbox_status = 'running' AND sandbox_id IS NOT NULL`,
    );

    if (sandboxes.length === 0) {
        console.log('[Job:Backup] No running sandboxes, skipping');
        return;
    }

    const provider = sandboxService.getProvider() as DaytonaProvider;
    if (typeof provider.executeCommand !== 'function') {
        console.error('[Job:Backup] Provider does not support executeCommand');
        return;
    }

    const results = await Promise.allSettled(
        sandboxes.map((sandbox: SandboxRow) => backupSingleWorkspace(provider, backupService, sandbox)),
    );

    const failures = results.filter((r: PromiseSettledResult<void>) => r.status === 'rejected');
    for (const failure of failures) {
        console.error('[Job:Backup] Backup failed:', (failure as PromiseRejectedResult).reason);
    }

    const succeeded = results.filter((r: PromiseSettledResult<void>) => r.status === 'fulfilled').length;
    console.log(`[Job:Backup] Complete: ${succeeded}/${sandboxes.length} sandboxes backed up`);
}

export function startBackupSchedulerJob(
    sandboxService: SandboxService,
    backupService: S3BackupService,
): void {
    if (backupTask) return;

    const cronExpr = process.env.BACKUP_CRON || DEFAULT_CRON;

    backupTask = cron.schedule(cronExpr, () => {
        runBackupCycle(sandboxService, backupService).catch(err => {
            console.error('[Job:Backup] Cycle failed:', err instanceof Error ? err.message : String(err));
        });
    });

    console.log(`[Job:Backup] Scheduled with: ${cronExpr}`);
}

