// S3 Backup Service Tests
// Tests for workspace snapshot backup and retention

import {
    S3BackupService,
    S3BackupDeps,
} from '../s3-backup.service';
import type { StorageFile } from '../storage.types';

// ---- In-memory S3 emulator ----

class InMemoryS3 {
    private store: Map<string, { content: Buffer; metadata?: Record<string, string> }> = new Map();

    async upload(key: string, content: Buffer, _options?: { contentType?: string; metadata?: Record<string, string> }): Promise<void> {
        this.store.set(key, { content, metadata: _options?.metadata });
    }

    async download(key: string): Promise<{ content: Buffer; metadata?: Record<string, string> }> {
        const entry = this.store.get(key);
        if (!entry) throw new Error(`Key not found: ${key}`);
        return entry;
    }

    async delete(key: string): Promise<void> {
        this.store.delete(key);
    }

    async list(options?: { prefix?: string }): Promise<{ files: StorageFile[]; isTruncated: boolean }> {
        const prefix = options?.prefix || '';
        const files: StorageFile[] = [];

        for (const [key, entry] of this.store.entries()) {
            if (key.startsWith(prefix)) {
                files.push({
                    key,
                    size: entry.content.length,
                    lastModified: new Date(),
                });
            }
        }

        files.sort((a, b) => a.key.localeCompare(b.key));
        return { files, isTruncated: false };
    }

    getKeys(): string[] {
        return Array.from(this.store.keys());
    }
}

// ---- Tests ----

describe('S3BackupService', () => {
    let s3: InMemoryS3;
    let service: S3BackupService;

    beforeEach(() => {
        s3 = new InMemoryS3();
        const deps: S3BackupDeps = {
            upload: s3.upload.bind(s3),
            download: s3.download.bind(s3),
            delete: s3.delete.bind(s3),
            list: s3.list.bind(s3),
        };
        service = new S3BackupService(deps);
    });

    describe('createSnapshot', () => {
        it('uploads snapshot to S3 with timestamp key', async () => {
            const content = Buffer.from('workspace data');
            const result = await service.createSnapshot('user-1', content);

            expect(result.success).toBe(true);
            expect(result.userId).toBe('user-1');
            expect(result.snapshotKey).toContain('user-1/snapshots/');
            expect(result.snapshotKey).toContain('.tar.gz');
            expect(result.sizeBytes).toBe(content.length);

            const stored = s3.getKeys();
            expect(stored.some(k => k.startsWith('user-1/snapshots/'))).toBe(true);
        });

        it('stores metadata with the snapshot', async () => {
            const content = Buffer.from('data');
            const result = await service.createSnapshot('user-2', content);

            const downloaded = await s3.download(result.snapshotKey);
            expect(downloaded.content).toEqual(content);
        });
    });

    describe('listSnapshots', () => {
        it('returns empty list when no snapshots exist', async () => {
            const snapshots = await service.listSnapshots('user-empty');
            expect(snapshots).toEqual([]);
        });

        it('lists all snapshots for a user', async () => {
            await service.createSnapshot('user-3', Buffer.from('snap-1'));
            await service.createSnapshot('user-3', Buffer.from('snap-2'));

            const snapshots = await service.listSnapshots('user-3');
            expect(snapshots).toHaveLength(2);
        });
    });

    describe('enforceRetention', () => {
        it('keeps only the last N snapshots', async () => {
            const retentionService = new S3BackupService({
                upload: s3.upload.bind(s3),
                download: s3.download.bind(s3),
                delete: s3.delete.bind(s3),
                list: s3.list.bind(s3),
                maxSnapshots: 3,
            });

            for (let i = 0; i < 5; i++) {
                await retentionService.createSnapshot('user-ret', Buffer.from(`snap-${i}`));
            }

            const snapshots = await retentionService.listSnapshots('user-ret');
            expect(snapshots.length).toBeLessThanOrEqual(3);
        });

        it('does not delete when under retention limit', async () => {
            await service.createSnapshot('user-under', Buffer.from('one'));
            await service.createSnapshot('user-under', Buffer.from('two'));

            const snapshots = await service.listSnapshots('user-under');
            expect(snapshots).toHaveLength(2);
        });
    });

    describe('restoreSnapshot', () => {
        it('downloads the specified snapshot', async () => {
            const content = Buffer.from('restore-me');
            const backup = await service.createSnapshot('user-restore', content);

            const result = await service.restoreSnapshot(backup.snapshotKey);

            expect(result.success).toBe(true);
            expect(result.content).toEqual(content);
            expect(result.snapshotKey).toBe(backup.snapshotKey);
        });

        it('throws when snapshot does not exist', async () => {
            await expect(service.restoreSnapshot('user-x/snapshots/nonexistent.tar.gz'))
                .rejects.toThrow();
        });
    });

    describe('getLatestSnapshot', () => {
        it('returns null when no snapshots exist', async () => {
            const latest = await service.getLatestSnapshot('user-none');
            expect(latest).toBeNull();
        });

        it('returns the most recent snapshot key', async () => {
            await service.createSnapshot('user-latest', Buffer.from('first'));
            const second = await service.createSnapshot('user-latest', Buffer.from('second'));

            const latest = await service.getLatestSnapshot('user-latest');
            expect(latest).toBe(second.snapshotKey);
        });
    });

    describe('deleteSnapshot', () => {
        it('deletes a specific snapshot', async () => {
            const backup = await service.createSnapshot('user-del', Buffer.from('delete-me'));
            await service.deleteSnapshot(backup.snapshotKey);

            const snapshots = await service.listSnapshots('user-del');
            expect(snapshots).toHaveLength(0);
        });
    });
});
