// S3 Backup Service (Workspace Snapshots)
// Periodic workspace snapshots to S3 for disaster recovery.
// Triggered before pause/kill. Configurable retention.
// Deduplication: SHA-256 hash stored in metadata; skip upload if workspace unchanged.

import { createHash } from 'crypto';
import { logger } from '../../../utils/logger';
import type { StorageFile } from './storage.types';

const log = logger('S3Backup');

const DEFAULT_MAX_SNAPSHOTS = 7;
const HASH_METADATA_KEY = 'content_sha256';

// ---- Result types ----

export interface BackupResult {
    success: boolean;
    userId: string;
    snapshotKey: string;
    sizeBytes: number;
    createdAt: string;
    skipped?: boolean;
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
    head?: (key: string) => Promise<{ metadata?: Record<string, string> } | null>;
    maxSnapshots?: number;
}

// ---- Service ----

export class S3BackupService {
    private readonly upload: S3BackupDeps['upload'];
    private readonly download: S3BackupDeps['download'];
    private readonly deleteFn: S3BackupDeps['delete'];
    private readonly list: S3BackupDeps['list'];
    private readonly headFn: S3BackupDeps['head'];
    private readonly maxSnapshots: number;

    constructor(deps: S3BackupDeps) {
        this.upload = deps.upload;
        this.download = deps.download;
        this.deleteFn = deps.delete;
        this.list = deps.list;
        this.headFn = deps.head;
        this.maxSnapshots = deps.maxSnapshots ?? DEFAULT_MAX_SNAPSHOTS;
    }

    async createSnapshot(userId: string, content: Buffer): Promise<BackupResult> {
        const contentHash = createHash('sha256').update(content).digest('hex');

        // Check if latest snapshot has the same content (deduplication)
        const latestKey = await this.getLatestSnapshot(userId);
        if (latestKey) {
            const latestHash = await this.getSnapshotHash(latestKey);
            if (latestHash === contentHash) {
                log.info('Snapshot skipped (unchanged)', { user_id: userId, hash: contentHash.slice(0, 12) });
                return {
                    success: true,
                    userId,
                    snapshotKey: latestKey,
                    sizeBytes: content.length,
                    createdAt: new Date().toISOString(),
                    skipped: true,
                };
            }
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const uniqueSuffix = Math.random().toString(36).slice(2, 6);
        const snapshotKey = `${userId}/snapshots/${timestamp}-${uniqueSuffix}.tar.gz`;

        await this.upload(snapshotKey, content, {
            contentType: 'application/gzip',
            metadata: {
                user_id: userId,
                created_at: new Date().toISOString(),
                [HASH_METADATA_KEY]: contentHash,
            },
        });

        await this.enforceRetention(userId);

        log.info('Created snapshot', { user_id: userId, snapshot_key: snapshotKey, size_bytes: content.length, hash: contentHash.slice(0, 12) });

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

        log.info('Restored snapshot', { snapshot_key: snapshotKey, size_bytes: downloaded.content.length });

        return {
            success: true,
            snapshotKey,
            content: downloaded.content,
            sizeBytes: downloaded.content.length,
        };
    }

    async deleteSnapshot(snapshotKey: string): Promise<void> {
        await this.deleteFn(snapshotKey);
        log.info('Deleted snapshot', { snapshot_key: snapshotKey });
    }

    private async getSnapshotHash(snapshotKey: string): Promise<string | null> {
        // Prefer head (metadata-only, no download) when available
        if (this.headFn) {
            try {
                const result = await this.headFn(snapshotKey);
                return result?.metadata?.[HASH_METADATA_KEY] ?? null;
            } catch {
                return null;
            }
        }

        // Fallback: download the snapshot to read metadata (old snapshots without head dep)
        try {
            const result = await this.download(snapshotKey);
            return result.metadata?.[HASH_METADATA_KEY] ?? null;
        } catch {
            return null;
        }
    }

    private async enforceRetention(userId: string): Promise<void> {
        const snapshots = await this.listSnapshots(userId);
        if (snapshots.length <= this.maxSnapshots) return;

        const toDelete = snapshots.slice(0, snapshots.length - this.maxSnapshots);
        for (const file of toDelete) {
            await this.deleteFn(file.key);
            log.info('Retention cleanup: deleted snapshot', { snapshot_key: file.key });
        }
    }
}
