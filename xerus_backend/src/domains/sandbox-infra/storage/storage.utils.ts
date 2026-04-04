// Storage Utilities
// Standalone validation and path-building functions for S3 storage operations

import type { StoragePaths } from './storage.types';

// -----------------------------------------------------------------------------
// Storage Categories
// -----------------------------------------------------------------------------

export const STORAGE_CATEGORIES = ['snapshots', 'knowledge', 'runs'] as const;
export type StorageCategory = (typeof STORAGE_CATEGORIES)[number];

// -----------------------------------------------------------------------------
// Security Utilities
// -----------------------------------------------------------------------------

const USER_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function validateUserId(userId: string): void {
    if (!userId) {
        throw new Error('User ID is required');
    }
    if (!USER_ID_PATTERN.test(userId)) {
        throw new Error('Invalid user ID: must contain only alphanumeric characters, underscores, and hyphens');
    }
    if (userId.length > 128) {
        throw new Error('Invalid user ID: exceeds maximum length of 128 characters');
    }
}

export function sanitizePath(path: string): string {
    if (!path) {
        return '';
    }

    let sanitized = path;

    // Decode URL-encoded characters to catch encoded traversal attempts
    try {
        sanitized = decodeURIComponent(sanitized);
    } catch {
        // If decoding fails, continue with original (may contain invalid sequences)
    }

    // Reject null bytes
    if (sanitized.includes('\0')) {
        throw new Error('Invalid path: contains null bytes');
    }

    // Normalize path separators to forward slashes
    sanitized = sanitized.replace(/\\/g, '/');

    // Reject path traversal sequences
    if (sanitized.includes('../') || sanitized.includes('/..') || sanitized === '..') {
        throw new Error('Invalid path: contains path traversal sequence');
    }

    // Remove leading slashes
    sanitized = sanitized.replace(/^\/+/, '');

    // Collapse multiple slashes
    sanitized = sanitized.replace(/\/+/g, '/');

    // Remove trailing slashes (except for empty string)
    if (sanitized.length > 0) {
        sanitized = sanitized.replace(/\/+$/, '');
    }

    return sanitized;
}

export function assertPathContainment(resolvedKey: string, expectedPrefix: string): void {
    if (!resolvedKey.startsWith(expectedPrefix)) {
        throw new Error('Invalid path: escapes user storage boundary');
    }
}

// -----------------------------------------------------------------------------
// Path Generation Utilities
// -----------------------------------------------------------------------------

export function generateUserPaths(userId: string): StoragePaths {
    validateUserId(userId);
    return {
        userId,
        snapshots: `${userId}/snapshots/`,
        knowledge: `${userId}/knowledge/`,
        runs: `${userId}/runs/`,
    };
}

export function buildS3Key(
    userId: string,
    category: StorageCategory,
    filePath: string
): string {
    validateUserId(userId);
    const sanitizedPath = sanitizePath(filePath);
    const key = `${userId}/${category}/${sanitizedPath}`;
    const expectedPrefix = `${userId}/${category}/`;
    assertPathContainment(key, expectedPrefix);
    return key;
}

/**
 * Build an S3 key prefix for listing/copying/deleting all objects under a path.
 * Unlike buildS3Key, this preserves the trailing slash needed for prefix operations.
 * Without the trailing slash, prefix 'agents/slug' would also match 'agents/slug-v2'.
 */
export function buildS3Prefix(
    userId: string,
    category: StorageCategory,
    dirPath: string
): string {
    validateUserId(userId);
    const sanitizedPath = sanitizePath(dirPath);
    if (!sanitizedPath) {
        return `${userId}/${category}/`;
    }
    const prefix = `${userId}/${category}/${sanitizedPath}/`;
    const expectedPrefix = `${userId}/${category}/`;
    assertPathContainment(prefix, expectedPrefix);
    return prefix;
}

export interface ParsedS3Key {
    userId: string;
    category: StorageCategory;
    path: string;
}

export function parseS3Key(key: string): ParsedS3Key {
    const parts = key.split('/');

    if (parts.length < 2) {
        throw new Error('Invalid S3 key format: expected userId/category/path');
    }

    const userId = parts[0];
    const category = parts[1] as StorageCategory;

    if (!STORAGE_CATEGORIES.includes(category)) {
        throw new Error(`Unknown storage category: ${category}`);
    }

    const path = parts.slice(2).join('/');

    return { userId, category, path };
}

// -----------------------------------------------------------------------------
// Delete Result Type
// -----------------------------------------------------------------------------

export interface DeleteMultipleResult {
    deletedCount: number;
    errors: Array<{ key: string; error: string }>;
}
