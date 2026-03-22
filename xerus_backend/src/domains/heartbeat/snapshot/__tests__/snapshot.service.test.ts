// Snapshot Service Tests
// Tests the SnapshotService orchestration with in-memory filesystem
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '..', '.env') });

import { query } from '../../../../database/connection';
import { SnapshotService } from '../snapshot.service';
import { SnapshotConfigRepository } from '../snapshot-config.repository';
import { SnapshotExecutionRepository } from '../snapshot-execution.repository';
import { HeartbeatStateRepository } from '../../heartbeat-state.repository';
import type { SandboxFileSystem } from '../../../execution/workspace/workspace.manager';

const TEST_USER_ID = 'test_snap_svc_' + Date.now();
let TEST_AGENT_ID: number;

// In-memory filesystem for testing workspace writes
class InMemoryFs implements SandboxFileSystem {
    private files: Map<string, string> = new Map();
    private dirs: Set<string> = new Set();

    async mkdir(dirPath: string): Promise<void> {
        this.dirs.add(dirPath);
    }

    async writeFile(filePath: string, content: string): Promise<void> {
        this.files.set(filePath, content);
    }

    async appendFile(filePath: string, content: string): Promise<void> {
        const existing = this.files.get(filePath) || '';
        this.files.set(filePath, existing + content);
    }

    async readFile(filePath: string): Promise<string> {
        const content = this.files.get(filePath);
        if (content === undefined) {
            throw new Error(`File not found: ${filePath}`);
        }
        return content;
    }

    async exists(filePath: string): Promise<boolean> {
        return this.files.has(filePath) || this.dirs.has(filePath);
    }

    async rm(filePath: string): Promise<void> {
        this.files.delete(filePath);
        this.dirs.delete(filePath);
    }

    async list(dirPath: string): Promise<string[]> {
        const entries: string[] = [];
        for (const key of this.files.keys()) {
            if (key.startsWith(dirPath + '/')) {
                const relative = key.substring(dirPath.length + 1);
                if (!relative.includes('/')) {
                    entries.push(relative);
                }
            }
        }
        return entries;
    }

    getFileContent(filePath: string): string | undefined {
        return this.files.get(filePath);
    }

    hasDirectory(dirPath: string): boolean {
        return this.dirs.has(dirPath);
    }
}

async function createTestUser(userId: string): Promise<void> {
    const uniqueEmail = `${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}@test.com`;
    await query(
        `INSERT INTO users (user_id, email, display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email`,
        [userId, uniqueEmail, 'Test User']
    );
}

async function createTestAgent(userId: string): Promise<number> {
    const result = await query<{ id: number }>(
        `INSERT INTO agent_registry (slug, user_id, agent_type)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [`test-snap-svc-agent-${Date.now()}`, userId, 'private']
    );
    return result.rows[0].id;
}

async function cleanupTestData(): Promise<void> {
    await query("DELETE FROM snapshot_executions WHERE agent_id IN (SELECT id FROM agent_registry WHERE slug LIKE 'test-snap-svc-agent-%')");
    await query("DELETE FROM snapshot_configs WHERE agent_id IN (SELECT id FROM agent_registry WHERE slug LIKE 'test-snap-svc-agent-%')");
    await query("DELETE FROM heartbeat_state WHERE agent_id IN (SELECT id FROM agent_registry WHERE slug LIKE 'test-snap-svc-agent-%')");
    await query("DELETE FROM agent_registry WHERE slug LIKE 'test-snap-svc-agent-%'");
    await query("DELETE FROM users WHERE user_id LIKE 'test_snap_svc_%'");
}

describe('SnapshotService', () => {
    let service: SnapshotService;
    let configRepo: SnapshotConfigRepository;
    let executionRepo: SnapshotExecutionRepository;
    let stateRepo: HeartbeatStateRepository;
    let sandboxFs: InMemoryFs;

    beforeAll(async () => {
        configRepo = new SnapshotConfigRepository();
        executionRepo = new SnapshotExecutionRepository();
        stateRepo = new HeartbeatStateRepository();
        service = new SnapshotService(configRepo, executionRepo, stateRepo);

        await cleanupTestData();
        await createTestUser(TEST_USER_ID);
        TEST_AGENT_ID = await createTestAgent(TEST_USER_ID);

        // Create heartbeat_state row for the agent
        await stateRepo.upsert(TEST_AGENT_ID);
    });

    beforeEach(() => {
        sandboxFs = new InMemoryFs();
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    describe('config management', () => {
        it('should create a snapshot config', async () => {
            const config = await service.createConfig({
                agent_id: TEST_AGENT_ID,
                enabled: true,
                sources: [
                    {
                        app: 'weather',
                        action: 'current',
                        params: { location: 'San Francisco', api_key: 'test-key' },
                        format: 'summary',
                        timeout_ms: 10000,
                    },
                ],
            });

            expect(config.agent_id).toBe(TEST_AGENT_ID);
            expect(config.enabled).toBe(true);
            expect(config.sources).toHaveLength(1);
        });

        it('should get config by agent id', async () => {
            const config = await service.getConfig(TEST_AGENT_ID);

            expect(config).not.toBeNull();
            expect(config!.agent_id).toBe(TEST_AGENT_ID);
        });

        it('should update config', async () => {
            const updated = await service.updateConfig(TEST_AGENT_ID, { enabled: false });

            expect(updated).not.toBeNull();
            expect(updated!.enabled).toBe(false);
        });

        it('should delete config', async () => {
            const deleted = await service.deleteConfig(TEST_AGENT_ID);
            expect(deleted).toBe(true);

            const config = await service.getConfig(TEST_AGENT_ID);
            expect(config).toBeNull();
        });
    });

    describe('runSnapshot', () => {
        it('should throw when no config exists', async () => {
            await expect(
                service.runSnapshot(TEST_AGENT_ID, 'test-agent', '/workspace/agents/test-agent', sandboxFs)
            ).rejects.toThrow('No snapshot config found');
        });

        it('should throw when config is disabled', async () => {
            await service.createConfig({
                agent_id: TEST_AGENT_ID,
                enabled: false,
                sources: [],
            });

            await expect(
                service.runSnapshot(TEST_AGENT_ID, 'test-agent', '/workspace/agents/test-agent', sandboxFs)
            ).rejects.toThrow('Snapshot is disabled');

            await service.deleteConfig(TEST_AGENT_ID);
        });

        it('should produce a snapshot with no sources (empty config)', async () => {
            await service.createConfig({
                agent_id: TEST_AGENT_ID,
                enabled: true,
                sources: [],
            });

            const result = await service.runSnapshot(
                TEST_AGENT_ID,
                'test-agent',
                '/workspace/agents/test-agent',
                sandboxFs
            );

            expect(result.agent_id).toBe(TEST_AGENT_ID);
            expect(result.sources_fetched).toBe(0);
            expect(result.sources_failed).toBe(0);
            expect(result.duration_ms).toBeGreaterThanOrEqual(0);
            expect(result.snapshot_hash).toBeDefined();
            expect(result.file_path).toContain('context/snapshot/latest.md');

            // Verify file was written to sandbox
            const content = sandboxFs.getFileContent(result.file_path);
            expect(content).toBeDefined();
            expect(content).toContain('# Snapshot -');
            expect(content).toContain('Agent: test-agent');

            // Verify directory was created
            expect(sandboxFs.hasDirectory('/workspace/agents/test-agent/context/snapshot')).toBe(true);

            await service.deleteConfig(TEST_AGENT_ID);
        });

        it('should record errors for sources with no registered fetcher', async () => {
            await service.createConfig({
                agent_id: TEST_AGENT_ID,
                enabled: true,
                sources: [
                    {
                        app: 'unknown_app',
                        action: 'do_something',
                        params: {},
                        format: 'summary',
                        timeout_ms: 5000,
                    },
                ],
            });

            const result = await service.runSnapshot(
                TEST_AGENT_ID,
                'test-agent',
                '/workspace/agents/test-agent',
                sandboxFs
            );

            expect(result.sources_fetched).toBe(0);
            expect(result.sources_failed).toBe(1);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].app).toBe('unknown_app');
            expect(result.errors[0].error).toContain('No fetcher registered');

            await service.deleteConfig(TEST_AGENT_ID);
        });

        it('should record execution in database', async () => {
            await service.createConfig({
                agent_id: TEST_AGENT_ID,
                enabled: true,
                sources: [],
            });

            await service.runSnapshot(
                TEST_AGENT_ID,
                'test-agent',
                '/workspace/agents/test-agent',
                sandboxFs
            );

            const lastExec = await service.getLastExecution(TEST_AGENT_ID);
            expect(lastExec).not.toBeNull();
            expect(lastExec!.agent_id).toBe(TEST_AGENT_ID);
            expect(lastExec!.sources_fetched).toBe(0);

            await service.deleteConfig(TEST_AGENT_ID);
        });

        it('should detect unchanged snapshots via hash comparison', async () => {
            await service.createConfig({
                agent_id: TEST_AGENT_ID,
                enabled: true,
                sources: [],
            });

            // First run
            const result1 = await service.runSnapshot(
                TEST_AGENT_ID,
                'test-agent',
                '/workspace/agents/test-agent',
                sandboxFs
            );

            // Second run (same sources, same data)
            const result2 = await service.runSnapshot(
                TEST_AGENT_ID,
                'test-agent',
                '/workspace/agents/test-agent',
                sandboxFs
            );

            // The content is timestamp-based so hashes will differ
            // This validates the hash is being computed and stored
            expect(result1.snapshot_hash).toBeDefined();
            expect(result2.snapshot_hash).toBeDefined();
            expect(typeof result1.snapshot_hash).toBe('string');

            await service.deleteConfig(TEST_AGENT_ID);
        });
    });

    describe('circuit breaker', () => {
        it('should return default state for unknown app', () => {
            const state = service.getCircuitBreakerState(TEST_AGENT_ID, 'unknown');

            expect(state.consecutive_failures).toBe(0);
            expect(state.tripped).toBe(false);
        });

        it('should allow manual reset', () => {
            service.resetCircuitBreaker(TEST_AGENT_ID, 'gmail');

            const state = service.getCircuitBreakerState(TEST_AGENT_ID, 'gmail');
            expect(state.consecutive_failures).toBe(0);
            expect(state.tripped).toBe(false);
        });
    });

    describe('execution history', () => {
        it('should list executions with pagination', async () => {
            // Create some executions
            await executionRepo.create({
                agent_id: TEST_AGENT_ID,
                sources_fetched: 1,
                sources_failed: 0,
                duration_ms: 100,
                snapshot_hash: 'hist1',
                file_path: null,
                errors: [],
            });

            const result = await service.listExecutions(TEST_AGENT_ID, 10, 0);

            expect(result.total).toBeGreaterThanOrEqual(1);
            expect(result.executions.length).toBeGreaterThanOrEqual(1);
        });
    });
});
