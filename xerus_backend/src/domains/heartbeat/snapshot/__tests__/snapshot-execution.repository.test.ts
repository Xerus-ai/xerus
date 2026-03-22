// Snapshot Execution Repository Tests - Real Database
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '..', '.env') });

import { query } from '../../../../database/connection';
import { SnapshotExecutionRepository, snapshotExecutionRepository } from '../snapshot-execution.repository';

const TEST_USER_ID = 'test_snap_exec_' + Date.now();
let TEST_AGENT_ID: number;

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
        [`test-snap-exec-agent-${Date.now()}`, userId, 'private']
    );
    return result.rows[0].id;
}

async function cleanupTestData(): Promise<void> {
    await query("DELETE FROM snapshot_executions WHERE agent_id IN (SELECT id FROM agent_registry WHERE slug LIKE 'test-snap-exec-agent-%')");
    await query("DELETE FROM agent_registry WHERE slug LIKE 'test-snap-exec-agent-%'");
    await query("DELETE FROM users WHERE user_id LIKE 'test_snap_exec_%'");
}

describe('SnapshotExecutionRepository', () => {
    let repo: SnapshotExecutionRepository;

    beforeAll(async () => {
        repo = snapshotExecutionRepository;
        await cleanupTestData();
        await createTestUser(TEST_USER_ID);
        TEST_AGENT_ID = await createTestAgent(TEST_USER_ID);
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    describe('create', () => {
        it('should create a snapshot execution record', async () => {
            const execution = await repo.create({
                agent_id: TEST_AGENT_ID,
                sources_fetched: 3,
                sources_failed: 1,
                duration_ms: 2500,
                snapshot_hash: 'abc123def456',
                file_path: '/workspace/agents/test-agent/context/snapshot/latest.md',
                errors: [
                    { app: 'notion', error: 'connection timeout', used_cache: true, cache_age_ms: 30000 },
                ],
            });

            expect(execution.id).toBeDefined();
            expect(execution.agent_id).toBe(TEST_AGENT_ID);
            expect(execution.sources_fetched).toBe(3);
            expect(execution.sources_failed).toBe(1);
            expect(execution.duration_ms).toBe(2500);
            expect(execution.snapshot_hash).toBe('abc123def456');
            expect(execution.file_path).toBe('/workspace/agents/test-agent/context/snapshot/latest.md');
            expect(execution.errors).toHaveLength(1);
            expect(execution.errors[0].app).toBe('notion');
            expect(execution.errors[0].used_cache).toBe(true);
        });

        it('should create execution with no errors', async () => {
            const execution = await repo.create({
                agent_id: TEST_AGENT_ID,
                sources_fetched: 4,
                sources_failed: 0,
                duration_ms: 1200,
                snapshot_hash: 'xyz789',
                file_path: '/workspace/agents/test-agent/context/snapshot/latest.md',
                errors: [],
            });

            expect(execution.sources_failed).toBe(0);
            expect(execution.errors).toHaveLength(0);
        });
    });

    describe('getLatestByAgentId', () => {
        it('should return the most recent execution', async () => {
            const latest = await repo.getLatestByAgentId(TEST_AGENT_ID);

            expect(latest).not.toBeNull();
            expect(latest!.agent_id).toBe(TEST_AGENT_ID);
            // Most recent should be the second one created (hash xyz789)
            expect(latest!.snapshot_hash).toBe('xyz789');
        });

        it('should return null for non-existent agent', async () => {
            const latest = await repo.getLatestByAgentId(999999);

            expect(latest).toBeNull();
        });
    });

    describe('getById', () => {
        it('should return execution by id', async () => {
            const created = await repo.create({
                agent_id: TEST_AGENT_ID,
                sources_fetched: 1,
                sources_failed: 0,
                duration_ms: 500,
                snapshot_hash: 'byid123',
                file_path: null,
                errors: [],
            });

            const found = await repo.getById(created.id);

            expect(found).not.toBeNull();
            expect(found!.id).toBe(created.id);
            expect(found!.snapshot_hash).toBe('byid123');
        });
    });

    describe('listByAgentId', () => {
        it('should return paginated executions', async () => {
            const result = await repo.listByAgentId(TEST_AGENT_ID, 2, 0);

            expect(result.total).toBeGreaterThanOrEqual(3);
            expect(result.executions).toHaveLength(2);
            // Should be ordered by created_at DESC
            expect(result.executions[0].created_at.getTime()).toBeGreaterThanOrEqual(
                result.executions[1].created_at.getTime()
            );
        });

        it('should support offset', async () => {
            const page1 = await repo.listByAgentId(TEST_AGENT_ID, 1, 0);
            const page2 = await repo.listByAgentId(TEST_AGENT_ID, 1, 1);

            expect(page1.executions[0].id).not.toBe(page2.executions[0].id);
        });
    });

    describe('deleteByAgentId', () => {
        it('should delete all executions for agent', async () => {
            const deletedCount = await repo.deleteByAgentId(TEST_AGENT_ID);

            expect(deletedCount).toBeGreaterThan(0);

            const latest = await repo.getLatestByAgentId(TEST_AGENT_ID);
            expect(latest).toBeNull();
        });
    });
});
