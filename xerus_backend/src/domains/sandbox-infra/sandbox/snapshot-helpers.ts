// Snapshot Helpers
// Shared tar/restore operations for workspace backup/restore.
// Used by SandboxService (lifecycle hooks) and DriveService (user-triggered).

import { SANDBOX_CONFIG, BACKUP_TAR_EXCLUDE_FLAGS } from './sandbox.config';
import type { DaytonaProvider } from './providers/daytona.provider';

const TAR_PATH = '/tmp/workspace-snapshot.tar.gz';

/**
 * Create a tar.gz snapshot of the workspace inside a sandbox.
 * Returns the snapshot as a Buffer, or null if the sandbox is unreachable.
 */
export async function createWorkspaceTar(
    provider: DaytonaProvider,
    sandboxId: string,
): Promise<Buffer> {
    const tarResult = await provider.executeCommand(
        sandboxId,
        `tar czf ${TAR_PATH} -C ${SANDBOX_CONFIG.workspacePath} ${BACKUP_TAR_EXCLUDE_FLAGS} . 2>/dev/null`,
    );
    if (tarResult.exitCode !== 0) {
        throw new Error(`tar failed (exit ${tarResult.exitCode}): ${tarResult.result}`);
    }

    const base64Result = await provider.executeCommand(
        sandboxId,
        `base64 -w 0 ${TAR_PATH}`,
    );
    if (base64Result.exitCode !== 0) {
        throw new Error(`base64 read failed: ${base64Result.result}`);
    }

    await provider.executeCommand(sandboxId, `rm -f ${TAR_PATH}`);

    return Buffer.from(base64Result.result.trim(), 'base64');
}

/**
 * Extract a tar.gz snapshot into the workspace inside a sandbox.
 */
export async function restoreWorkspaceTar(
    provider: DaytonaProvider,
    sandboxId: string,
    tarBuffer: Buffer,
): Promise<void> {
    await provider.uploadFile(sandboxId, tarBuffer.toString('base64'), TAR_PATH);

    try {
        // Use the same exclude flags on extract so old backups (created before
        // infrastructure paths were excluded) don't overwrite template files.
        const extractResult = await provider.executeCommand(
            sandboxId,
            `tar xzf ${TAR_PATH} -C ${SANDBOX_CONFIG.workspacePath} --no-same-owner ${BACKUP_TAR_EXCLUDE_FLAGS}`,
        );
        if (extractResult.exitCode !== 0) {
            throw new Error(`tar extract failed: ${extractResult.result}`);
        }
    } finally {
        await provider.executeCommand(sandboxId, `rm -f ${TAR_PATH}`);
    }
}
