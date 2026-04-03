// Storage Service
// S3 operations for workspace persistence
// Split: utility functions moved to storage.utils.ts

import { logger } from '../../../utils/logger';
import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    CopyObjectCommand,
} from '@aws-sdk/client-s3';
import type {
    StorageConfig,
    StoragePaths,
    StorageFile,
    UploadOptions,
    DownloadResult,
    ListOptions,
    ListResult,
} from './storage.types';
import { StorageSyncError } from '../../execution/errors';

// Re-export all utils so existing importers of storage.service still work
export {
    STORAGE_CATEGORIES,
    validateUserId,
    sanitizePath,
    assertPathContainment,
    generateUserPaths,
    buildS3Key,
    buildS3Prefix,
    parseS3Key,
} from './storage.utils';
export type { StorageCategory, ParsedS3Key, DeleteMultipleResult } from './storage.utils';

import { type StorageCategory, type DeleteMultipleResult, generateUserPaths, buildS3Key } from './storage.utils';

const log = logger('StorageService');

export class StorageService {
    private readonly client: S3Client;
    private readonly config: StorageConfig;

    constructor(config: StorageConfig) {
        if (!config.bucket) {
            throw new Error('Storage bucket is required');
        }
        if (!config.region) {
            throw new Error('Storage region is required');
        }

        this.config = config;

        const clientConfig: {
            region: string;
            credentials?: { accessKeyId: string; secretAccessKey: string };
            endpoint?: string;
            forcePathStyle?: boolean;
        } = {
            region: config.region,
        };

        if (config.accessKeyId && config.secretAccessKey) {
            clientConfig.credentials = {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            };
        }

        if (config.endpointUrl) {
            clientConfig.endpoint = config.endpointUrl;
            clientConfig.forcePathStyle = true; // Required for MinIO
        }

        this.client = new S3Client(clientConfig);
    }

    // -- Configuration Access --

    getConfig(): StorageConfig {
        return { ...this.config };
    }

    getUserPaths(userId: string): StoragePaths {
        return generateUserPaths(userId);
    }

    buildKey(userId: string, category: StorageCategory, filePath: string): string {
        return buildS3Key(userId, category, filePath);
    }

    // -- Path Helpers --

    getKnowledgePath(userId: string, filePath: string): string {
        return buildS3Key(userId, 'knowledge', filePath);
    }

    getRunPath(userId: string, runId: string, filePath: string): string {
        return buildS3Key(userId, 'runs', `${runId}/${filePath}`);
    }

    // -- Core S3 Operations --

    async upload(key: string, content: string | Buffer, options?: UploadOptions): Promise<void> {
        if (!key) throw new Error('S3 key is required');
        const body = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
        const command = new PutObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
            Body: body,
            ContentType: options?.contentType,
            Metadata: options?.metadata,
        });

        try {
            await this.client.send(command);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new StorageSyncError('upload', key, message);
        }
    }

    async download(key: string): Promise<DownloadResult> {
        if (!key) throw new Error('S3 key is required');
        const command = new GetObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
        });

        try {
            const response = await this.client.send(command);
            const bodyArray = await response.Body?.transformToByteArray();

            if (!bodyArray) {
                throw new Error('Empty response body');
            }

            return {
                content: Buffer.from(bodyArray),
                contentType: response.ContentType,
                metadata: response.Metadata,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new StorageSyncError('download', key, message);
        }
    }

    async delete(key: string): Promise<void> {
        if (!key) throw new Error('S3 key is required');
        const command = new DeleteObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
        });

        try {
            await this.client.send(command);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new StorageSyncError('delete', key, message);
        }
    }

    async deleteMultiple(keys: string[]): Promise<DeleteMultipleResult> {
        if (keys.length === 0) {
            return { deletedCount: 0, errors: [] };
        }

        const command = new DeleteObjectsCommand({
            Bucket: this.config.bucket,
            Delete: {
                Objects: keys.map((key) => ({ Key: key })),
                Quiet: false,
            },
        });

        try {
            const response = await this.client.send(command);

            const errors =
                response.Errors?.map((err) => ({
                    key: err.Key || 'unknown',
                    error: err.Message || 'Unknown error',
                })) || [];

            const deletedCount = response.Deleted?.length || 0;

            return { deletedCount, errors };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new StorageSyncError('delete', keys.join(', '), message);
        }
    }

    async headObject(key: string): Promise<{ lastModified: Date; contentLength: number } | null> {
        if (!key) throw new Error('S3 key is required');
        const command = new HeadObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
        });

        try {
            const response = await this.client.send(command);
            return {
                lastModified: response.LastModified || new Date(0),
                contentLength: response.ContentLength || 0,
            };
        } catch (error) {
            const err = error as { name?: string };
            if (err.name === 'NotFound' || err.name === 'NoSuchKey') {
                return null;
            }
            throw error;
        }
    }

    async exists(key: string): Promise<boolean> {
        if (!key) throw new Error('S3 key is required');
        const command = new HeadObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
        });

        try {
            await this.client.send(command);
            return true;
        } catch (error) {
            const err = error as { name?: string };
            if (err.name === 'NotFound' || err.name === 'NoSuchKey') {
                return false;
            }
            throw error;
        }
    }

    async list(options?: ListOptions): Promise<ListResult> {
        const command = new ListObjectsV2Command({
            Bucket: this.config.bucket,
            Prefix: options?.prefix,
            MaxKeys: options?.maxKeys,
            ContinuationToken: options?.continuationToken,
        });

        try {
            const response = await this.client.send(command);

            const files: StorageFile[] =
                response.Contents?.map((obj) => ({
                    key: obj.Key || '',
                    size: obj.Size || 0,
                    lastModified: obj.LastModified || new Date(),
                    etag: obj.ETag,
                })) || [];

            return {
                files,
                isTruncated: response.IsTruncated || false,
                continuationToken: response.NextContinuationToken,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new StorageSyncError('download', options?.prefix || '', message);
        }
    }

    // -- User-Specific List Operations --

    async listKnowledgeFiles(userId: string): Promise<ListResult> {
        const prefix = `${userId}/knowledge/`;
        return this.list({ prefix });
    }

    async listRunFiles(userId: string, runId: string): Promise<ListResult> {
        const prefix = `${userId}/runs/${runId}/`;
        return this.list({ prefix });
    }

    // -- Bulk Operations for Knowledge --

    async uploadKnowledgeFile(
        userId: string,
        filePath: string,
        content: string | Buffer,
        options?: UploadOptions
    ): Promise<void> {
        const key = this.getKnowledgePath(userId, filePath);
        await this.upload(key, content, options);
    }

    async downloadKnowledgeFile(userId: string, filePath: string): Promise<DownloadResult> {
        const key = this.getKnowledgePath(userId, filePath);
        return this.download(key);
    }

    // -- Run Snapshot Operations --

    async uploadRunFile(
        userId: string,
        runId: string,
        filePath: string,
        content: string | Buffer,
        options?: UploadOptions
    ): Promise<void> {
        const key = this.getRunPath(userId, runId, filePath);
        await this.upload(key, content, options);
    }

    async downloadRunFile(
        userId: string,
        runId: string,
        filePath: string
    ): Promise<DownloadResult> {
        const key = this.getRunPath(userId, runId, filePath);
        return this.download(key);
    }

    // -- Prefix Operations (Copy / Delete by prefix) --

    async copyObject(sourceKey: string, destKey: string): Promise<void> {
        if (!sourceKey || !destKey) throw new Error('Source and destination keys are required');
        const command = new CopyObjectCommand({
            Bucket: this.config.bucket,
            CopySource: `${this.config.bucket}/${sourceKey}`,
            Key: destKey,
        });

        try {
            await this.client.send(command);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new StorageSyncError('copy', `${sourceKey} -> ${destKey}`, message);
        }
    }

    async copyPrefix(sourcePrefix: string, destPrefix: string): Promise<number> {
        if (!sourcePrefix || !destPrefix) throw new Error('Source and destination prefixes are required');
        const COPY_CONCURRENCY = 10;
        let copied = 0;
        let continuationToken: string | undefined;

        do {
            const result = await this.list({
                prefix: sourcePrefix,
                continuationToken,
            });

            const copyable = result.files.filter((f) => {
                if (f.size === 0) return false;
                const relativePath = f.key.slice(sourcePrefix.length);
                return !!relativePath;
            });

            // Copy in batches of COPY_CONCURRENCY
            for (let i = 0; i < copyable.length; i += COPY_CONCURRENCY) {
                const batch = copyable.slice(i, i + COPY_CONCURRENCY);
                await Promise.all(
                    batch.map((file) => {
                        const relativePath = file.key.slice(sourcePrefix.length);
                        return this.copyObject(file.key, `${destPrefix}${relativePath}`);
                    }),
                );
                copied += batch.length;
            }

            continuationToken = result.isTruncated ? result.continuationToken : undefined;
        } while (continuationToken);

        return copied;
    }

    async deletePrefix(prefix: string): Promise<number> {
        if (!prefix) throw new Error('Prefix is required');
        let deleted = 0;
        // Re-list from beginning after each batch (continuation tokens invalidated by deletes)
        for (;;) {
            const result = await this.list({ prefix });

            if (result.files.length === 0) {
                break;
            }

            const keys = result.files.map((f) => f.key);
            const deleteResult = await this.deleteMultiple(keys);
            deleted += deleteResult.deletedCount;

            if (deleteResult.errors.length > 0) {
                log.warn('deletePrefix partial failures', {
                    prefix,
                    failures: deleteResult.errors.map((e) => `${e.key}: ${e.error}`).join(', '),
                });
            }
        }

        return deleted;
    }
}
