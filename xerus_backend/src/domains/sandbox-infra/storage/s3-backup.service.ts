// S3 Backup Service (Workspace Snapshots)
// Periodic workspace snapshots to S3 for disaster recovery.
// Triggered after significant executions. Configurable retention.

import type { StorageFile } from './storage.types';

const DEFAULT_MAX_SNAPSHOTS = 7;

// ---- Result types ----

export interface BackupResult {
    success: boolean;
    userId: string;
    snapshotKey: string;
    sizeBytes: number;
    createdAt: string;
}

export interface RestoreResult {
    success: boolean;
    snapshotKey: string;
    content: Buffer;
    sizeBytes: number;
}

// ---- Dependency injection (uses StorageService operations) ----

export interface S3BackupDeps {
    upload: (key: string, content: Buffer, options?: { contentType?: string; metadata?: Record<string, string> }) => Promise<void>;
    download: (key: string) => Promise<{ content: Buffer; metadata?: Record<string, string> }>;
    delete: (key: string) => Promise<void>;
    list: (options?: { prefix?: string }) => Promise<{ files: StorageFile[]; isTruncated: boolean }>;
    maxSnapshots?: number;
}

// ---- Service ----

export class S3BackupService {
    private readonly upload: S3BackupDeps['upload'];
    private readonly download: S3BackupDeps['download'];
    private readonly deleteFn: S3BackupDeps['delete'];
    private readonly list: S3BackupDeps['list'];
    private readonly maxSnapshots: number;

    constructor(deps: S3BackupDeps) {
        this.upload = deps.upload;
        this.download = deps.download;
        this.deleteFn = deps.delete;
        this.list = deps.list;
        this.maxSnapshots = deps.maxSnapshots ?? DEFAULT_MAX_SNAPSHOTS;
    }

    async createSnapshot(userId: string, content: Buffer): Promise<BackupResult> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const uniqueSuffix = Math.random().toString(36).slice(2, 6);
        const snapshotKey = `${userId}/snapshots/${timestamp}-${uniqueSuffix}.tar.gz`;

        await this.upload(snapshotKey, content, {
            contentType: 'application/gzip',
            metadata: {
                user_id: userId,
                created_at: new Date().toISOString(),
            },
        });

        await this.enforceRetention(userId);

        console.log(
            `[S3Backup] Created snapshot for user ${userId}: ${snapshotKey} (${content.length} bytes)`
        );

        return {
            success: true,
            userId,
            snapshotKey,
            sizeBytes: content.length,
            createdAt: new Date().toISOString(),
        };
    }

    async listSnapshots(userId: string): Promise<StorageFile[]> {
        const prefix = `${userId}/snapshots/`;
        const result = await this.list({ prefix });
        return result.files.sort((a, b) => a.key.localeCompare(b.key));
    }

    async getLatestSnapshot(userId: string): Promise<string | null> {
        const snapshots = await this.listSnapshots(userId);
        if (snapshots.length === 0) return null;
        return snapshots[snapshots.length - 1].key;
    }

    async restoreSnapshot(snapshotKey: string): Promise<RestoreResult> {
        const downloaded = await this.download(snapshotKey);

        console.log(
            `[S3Backup] Restored snapshot: ${snapshotKey} (${downloaded.content.length} bytes)`
        );

        return {
            success: true,
            snapshotKey,
            content: downloaded.content,
            sizeBytes: downloaded.content.length,
        };
    }

    async deleteSnapshot(snapshotKey: string): Promise<void> {
        await this.deleteFn(snapshotKey);
        console.log(`[S3Backup] Deleted snapshot: ${snapshotKey}`);
    }

    private async enforceRetention(userId: string): Promise<void> {
        const snapshots = await this.listSnapshots(userId);
        if (snapshots.length <= this.maxSnapshots) return;

        const toDelete = snapshots.slice(0, snapshots.length - this.maxSnapshots);
        for (const file of toDelete) {
            await this.deleteFn(file.key);
            console.log(`[S3Backup] Retention cleanup: deleted ${file.key}`);
        }
    }
}
