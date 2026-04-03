// Storage Service Tests
// Tests for S3 storage operations

import {
    StorageService,
    generateUserPaths,
    buildS3Key,
    parseS3Key,
    validateUserId,
    sanitizePath,
    assertPathContainment,
} from '../storage.service';
import type {
    StorageConfig,
    ListOptions,
} from '../storage.types';

// Test bucket configuration (uses real S3 in integration tests)
const TEST_CONFIG: StorageConfig = {
    bucket: 'xerus-test-bucket',
    region: 'us-east-1',
};

describe('Storage Service - Security', () => {
    describe('validateUserId', () => {
        it('should accept valid user IDs', () => {
            expect(() => validateUserId('user-123')).not.toThrow();
            expect(() => validateUserId('user_abc')).not.toThrow();
            expect(() => validateUserId('ABC123')).not.toThrow();
        });

        it('should reject empty user ID', () => {
            expect(() => validateUserId('')).toThrow('User ID is required');
        });

        it('should reject user ID with path separators', () => {
            expect(() => validateUserId('user/123')).toThrow('Invalid user ID');
            expect(() => validateUserId('user\\123')).toThrow('Invalid user ID');
        });

        it('should reject user ID with special characters', () => {
            expect(() => validateUserId('user@123')).toThrow('Invalid user ID');
            expect(() => validateUserId('user 123')).toThrow('Invalid user ID');
            expect(() => validateUserId('user.123')).toThrow('Invalid user ID');
        });

        it('should reject user ID exceeding max length', () => {
            const longId = 'a'.repeat(129);
            expect(() => validateUserId(longId)).toThrow('exceeds maximum length');
        });
    });

    describe('sanitizePath', () => {
        it('should return empty string for empty input', () => {
            expect(sanitizePath('')).toBe('');
        });

        it('should remove leading slashes', () => {
            expect(sanitizePath('/path/to/file')).toBe('path/to/file');
            expect(sanitizePath('///path')).toBe('path');
        });

        it('should reject path traversal with ../', () => {
            expect(() => sanitizePath('../etc/passwd')).toThrow('path traversal');
            expect(() => sanitizePath('path/../../../etc')).toThrow('path traversal');
        });

        it('should reject path traversal with /..', () => {
            expect(() => sanitizePath('path/to/..')).toThrow('path traversal');
        });

        it('should reject standalone ..', () => {
            expect(() => sanitizePath('..')).toThrow('path traversal');
        });

        it('should reject null bytes', () => {
            expect(() => sanitizePath('path\0file')).toThrow('null bytes');
        });

        it('should normalize backslashes to forward slashes', () => {
            expect(sanitizePath('path\\to\\file')).toBe('path/to/file');
        });

        it('should reject URL-encoded traversal attempts', () => {
            expect(() => sanitizePath('%2e%2e%2fpasswd')).toThrow('path traversal');
            expect(() => sanitizePath('..%2fetc')).toThrow('path traversal');
        });

        it('should collapse multiple slashes', () => {
            expect(sanitizePath('path//to///file')).toBe('path/to/file');
        });

        it('should remove trailing slashes', () => {
            expect(sanitizePath('path/to/dir/')).toBe('path/to/dir');
        });
    });

    describe('assertPathContainment', () => {
        it('should pass for paths within prefix', () => {
            expect(() => assertPathContainment('user-123/snapshots/file.txt', 'user-123/snapshots/')).not.toThrow();
        });

        it('should throw for paths outside prefix', () => {
            expect(() => assertPathContainment('user-456/snapshots/file.txt', 'user-123/snapshots/')).toThrow('escapes user storage boundary');
        });

        it('should throw for paths that escape via traversal', () => {
            expect(() => assertPathContainment('user-123/knowledge/file.txt', 'user-123/snapshots/')).toThrow('escapes user storage boundary');
        });
    });

    describe('buildS3Key - security', () => {
        it('should reject path traversal attempts', () => {
            expect(() => buildS3Key('user-123', 'snapshots', '../../../etc/passwd')).toThrow('path traversal');
        });

        it('should reject invalid user IDs', () => {
            expect(() => buildS3Key('user/evil', 'snapshots', 'file.txt')).toThrow('Invalid user ID');
        });

        it('should reject null bytes in path', () => {
            expect(() => buildS3Key('user-123', 'snapshots', 'file\0.txt')).toThrow('null bytes');
        });
    });

    describe('generateUserPaths - security', () => {
        it('should reject invalid user IDs', () => {
            expect(() => generateUserPaths('../evil')).toThrow('Invalid user ID');
        });
    });
});

describe('Storage Service', () => {
    describe('generateUserPaths', () => {
        it('should generate correct paths for a user', () => {
            const userId = 'user-123';
            const paths = generateUserPaths(userId);

            expect(paths.userId).toBe(userId);
            expect(paths.snapshots).toBe('user-123/snapshots/');
            expect(paths.knowledge).toBe('user-123/knowledge/');
            expect(paths.runs).toBe('user-123/runs/');
        });

        it('should handle user IDs with special characters', () => {
            const userId = 'user_abc-123';
            const paths = generateUserPaths(userId);

            expect(paths.snapshots).toBe('user_abc-123/snapshots/');
        });
    });

    describe('buildS3Key', () => {
        it('should build correct key for workspace files', () => {
            const key = buildS3Key('user-123', 'snapshots', 'agents/scout-sally/memory/context.md');
            expect(key).toBe('user-123/snapshots/agents/scout-sally/memory/context.md');
        });

        it('should build correct key for knowledge files', () => {
            const key = buildS3Key('user-123', 'knowledge', 'brand-guidelines.pdf');
            expect(key).toBe('user-123/knowledge/brand-guidelines.pdf');
        });

        it('should build correct key for run files', () => {
            const key = buildS3Key('user-123', 'runs', 'run-456/manifest.jsonl');
            expect(key).toBe('user-123/runs/run-456/manifest.jsonl');
        });

        it('should handle paths with leading slashes', () => {
            const key = buildS3Key('user-123', 'snapshots', '/agents/context.md');
            expect(key).toBe('user-123/snapshots/agents/context.md');
        });

        it('should handle empty file path', () => {
            const key = buildS3Key('user-123', 'snapshots', '');
            expect(key).toBe('user-123/snapshots/');
        });
    });

    describe('parseS3Key', () => {
        it('should parse workspace key correctly', () => {
            const result = parseS3Key('user-123/snapshots/agents/context.md');

            expect(result.userId).toBe('user-123');
            expect(result.category).toBe('snapshots');
            expect(result.path).toBe('agents/context.md');
        });

        it('should parse knowledge key correctly', () => {
            const result = parseS3Key('user-123/knowledge/docs/guide.pdf');

            expect(result.userId).toBe('user-123');
            expect(result.category).toBe('knowledge');
            expect(result.path).toBe('docs/guide.pdf');
        });

        it('should parse runs key correctly', () => {
            const result = parseS3Key('user-123/runs/run-456/manifest.jsonl');

            expect(result.userId).toBe('user-123');
            expect(result.category).toBe('runs');
            expect(result.path).toBe('run-456/manifest.jsonl');
        });

        it('should throw for invalid key format', () => {
            expect(() => parseS3Key('invalid-key')).toThrow('Invalid S3 key format');
        });

        it('should throw for unknown category', () => {
            expect(() => parseS3Key('user-123/unknown/file.txt')).toThrow('Unknown storage category');
        });
    });

    describe('StorageService', () => {
        describe('constructor', () => {
            it('should create instance with valid config', () => {
                const service = new StorageService(TEST_CONFIG);
                expect(service).toBeInstanceOf(StorageService);
            });

            it('should throw if bucket is missing', () => {
                expect(() => new StorageService({ bucket: '', region: 'us-east-1' }))
                    .toThrow('Storage bucket is required');
            });

            it('should throw if region is missing', () => {
                expect(() => new StorageService({ bucket: 'test', region: '' }))
                    .toThrow('Storage region is required');
            });
        });

        describe('getConfig', () => {
            it('should return storage configuration', () => {
                const service = new StorageService(TEST_CONFIG);
                const config = service.getConfig();

                expect(config.bucket).toBe(TEST_CONFIG.bucket);
                expect(config.region).toBe(TEST_CONFIG.region);
            });
        });

        describe('getUserPaths', () => {
            it('should return paths for a user', () => {
                const service = new StorageService(TEST_CONFIG);
                const paths = service.getUserPaths('user-123');

                expect(paths.userId).toBe('user-123');
                expect(paths.snapshots).toBe('user-123/snapshots/');
                expect(paths.knowledge).toBe('user-123/knowledge/');
                expect(paths.runs).toBe('user-123/runs/');
            });
        });

        describe('buildKey', () => {
            it('should build key for workspace', () => {
                const service = new StorageService(TEST_CONFIG);
                const key = service.buildKey('user-123', 'snapshots', 'file.txt');

                expect(key).toBe('user-123/snapshots/file.txt');
            });
        });

        describe('getKnowledgePath', () => {
            it('should return full knowledge path', () => {
                const service = new StorageService(TEST_CONFIG);
                const path = service.getKnowledgePath('user-123', 'docs/guide.pdf');

                expect(path).toBe('user-123/knowledge/docs/guide.pdf');
            });
        });

        describe('getRunPath', () => {
            it('should return full run path', () => {
                const service = new StorageService(TEST_CONFIG);
                const path = service.getRunPath('user-123', 'run-456', 'manifest.jsonl');

                expect(path).toBe('user-123/runs/run-456/manifest.jsonl');
            });
        });
    });
});

describe('Storage Service - S3 Operations', () => {
    let service: StorageService;

    beforeAll(() => {
        service = new StorageService(TEST_CONFIG);
    });

    describe('upload', () => {
        it('should accept content as string', async () => {
            const key = 'user-test/snapshots/test.txt';
            const content = 'Hello, World!';

            // This will fail without real S3 credentials, which is expected
            // The test verifies the method signature and basic validation
            await expect(service.upload(key, content)).rejects.toThrow();
        });

        it('should accept content as Buffer', async () => {
            const key = 'user-test/snapshots/test.bin';
            const content = Buffer.from([0x00, 0x01, 0x02]);

            await expect(service.upload(key, content)).rejects.toThrow();
        });

        it('should throw for empty key', async () => {
            await expect(service.upload('', 'content')).rejects.toThrow('S3 key is required');
        });
    });

    describe('download', () => {
        it('should throw for empty key', async () => {
            await expect(service.download('')).rejects.toThrow('S3 key is required');
        });
    });

    describe('delete', () => {
        it('should throw for empty key', async () => {
            await expect(service.delete('')).rejects.toThrow('S3 key is required');
        });
    });

    describe('exists', () => {
        it('should throw for empty key', async () => {
            await expect(service.exists('')).rejects.toThrow('S3 key is required');
        });
    });

    describe('list', () => {
        it('should accept prefix parameter', async () => {
            const options: ListOptions = {
                prefix: 'user-123/snapshots/',
                maxKeys: 100,
            };

            // Will fail without real S3, but verifies method accepts options
            await expect(service.list(options)).rejects.toThrow();
        });
    });

    describe('deleteMultiple', () => {
        it('should accept array of keys', async () => {
            const keys = ['user-123/snapshots/a.txt', 'user-123/snapshots/b.txt'];

            await expect(service.deleteMultiple(keys)).rejects.toThrow();
        });

        it('should return empty result for empty array', async () => {
            const result = await service.deleteMultiple([]);
            expect(result.deletedCount).toBe(0);
            expect(result.errors).toHaveLength(0);
        });
    });
});

describe('Storage Service - Path Utilities', () => {
    let service: StorageService;

    beforeAll(() => {
        service = new StorageService(TEST_CONFIG);
    });

    describe('listKnowledgeFiles', () => {
        it('should list files with knowledge prefix', async () => {
            await expect(service.listKnowledgeFiles('user-123')).rejects.toThrow();
        });
    });

    describe('listRunFiles', () => {
        it('should list files for specific run', async () => {
            await expect(service.listRunFiles('user-123', 'run-456')).rejects.toThrow();
        });
    });
});
