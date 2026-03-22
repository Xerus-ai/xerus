// Storage Domain Types
// Types for S3-based workspace persistence

// -----------------------------------------------------------------------------
// Storage Configuration
// -----------------------------------------------------------------------------

export interface StorageConfig {
    bucket: string;
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpointUrl?: string;
}

// -----------------------------------------------------------------------------
// S3 Path Structure (Daytona-first architecture)
// s3://xerus-users/{user_id}/
// ├── snapshots/      (disaster recovery tar.gz via s3-backup.service)
// ├── knowledge/      (KB doc backup - primary lives on Daytona)
// └── runs/{run_id}/  (execution history)
// -----------------------------------------------------------------------------

export interface StoragePaths {
    userId: string;
    snapshots: string;
    knowledge: string;
    runs: string;
}

// -----------------------------------------------------------------------------
// File Operations
// -----------------------------------------------------------------------------

export interface StorageFile {
    key: string;
    size: number;
    lastModified: Date;
    etag?: string;
}

export interface UploadOptions {
    contentType?: string;
    metadata?: Record<string, string>;
}

export interface DownloadResult {
    content: Buffer;
    contentType?: string;
    metadata?: Record<string, string>;
}

export interface ListOptions {
    prefix?: string;
    maxKeys?: number;
    continuationToken?: string;
}

export interface ListResult {
    files: StorageFile[];
    isTruncated: boolean;
    continuationToken?: string;
}

