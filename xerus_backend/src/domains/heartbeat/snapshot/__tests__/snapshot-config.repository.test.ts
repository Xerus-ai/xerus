// Snapshot Config Repository Tests - Real Database
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '..', '.env') });

import { query } from '../../../../database/connection';
import { SnapshotConfigRepository, snapshotConfigRepository } from '../snapshot-config.repository';

const TEST_USER_ID = 'test_snap_cfg_' + Date.now();
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
        [`test-snap-config-agent-${Date.now()}`, userId, 'private']
    );
    return result.rows[0].id;
}

async function cleanupTestData(): Promise<void> {
    await query("DELETE FROM snapshot_configs WHERE agent_id IN (SELECT id FROM agent_registry WHERE slug LIKE 'test-snap-config-agent-%')");
    await query("DELETE FROM agent_registry WHERE slug LIKE 'test-snap-config-agent-%'");
    await query("DELETE FROM users WHERE user_id LIKE 'test_snap_cfg_%'");
}

describe('SnapshotConfigRepository', () => {
    let repo: SnapshotConfigRepository;

    beforeAll(async () => {
        repo = snapshotConfigRepository;
        await cleanupTestData();
        await createTestUser(TEST_USER_ID);
        TEST_AGENT_ID = await createTestAgent(TEST_USER_ID);
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    describe('upsert', () => {
        it('should create a new snapshot config', async () => {
            const config = await repo.upsert({
                agent_id: TEST_AGENT_ID,
                enabled: true,
                run_before_ms: 300000,
                sources: [
                    {
                        app: 'gmail',
                        action: 'list_messages',
                        params: { filter: 'unread' },
                        format: 'summary',
                        timeout_ms: 30000,
                    },
                ],
            });

            expect(config.agent_id).toBe(TEST_AGENT_ID);
            expect(config.enabled).toBe(true);
            expect(config.run_before_ms).toBe(300000);
            expect(config.sources).toHaveLength(1);
            expect(config.sources[0].app).toBe('gmail');
        });

        it('should update existing config on conflict', async () => {
            const config = await repo.upsert({
                agent_id: TEST_AGENT_ID,
                enabled: false,
                run_before_ms: 600000,
                sources: [],
            });

            expect(config.agent_id).toBe(TEST_AGENT_ID);
            expect(config.enabled).toBe(false);
            expect(config.run_before_ms).toBe(600000);
            expect(config.sources).toHaveLength(0);
        });
    });

    describe('getByAgentId', () => {
        it('should return config for existing agent', async () => {
            const config = await repo.getByAgentId(TEST_AGENT_ID);

            expect(config).not.toBeNull();
            expect(config!.agent_id).toBe(TEST_AGENT_ID);
        });

        it('should return null for non-existent agent', async () => {
            const config = await repo.getByAgentId(999999);

            expect(config).toBeNull();
        });
    });

    describe('update', () => {
        it('should update enabled field', async () => {
            // Reset to enabled
            await repo.upsert({
                agent_id: TEST_AGENT_ID,
                enabled: true,
                sources: [],
            });

            const updated = await repo.update(TEST_AGENT_ID, { enabled: false });

            expect(updated).not.toBeNull();
            expect(updated!.enabled).toBe(false);
        });

        it('should update sources', async () => {
            const newSources = [
                {
                    app: 'github',
                    action: 'list_notifications',
                    params: { type: 'notifications' },
                    format: 'summary' as const,
                    timeout_ms: 15000,
                },
            ];

            const updated = await repo.update(TEST_AGENT_ID, { sources: newSources });

            expect(updated).not.toBeNull();
            expect(updated!.sources).toHaveLength(1);
            expect(updated!.sources[0].app).toBe('github');
        });

        it('should return null for non-existent agent', async () => {
            const updated = await repo.update(999999, { enabled: false });

            expect(updated).toBeNull();
        });

        it('should return current config when no fields provided', async () => {
            const current = await repo.getByAgentId(TEST_AGENT_ID);
            const updated = await repo.update(TEST_AGENT_ID, {});

            expect(updated).not.toBeNull();
            expect(updated!.id).toBe(current!.id);
        });
    });

    describe('deleteByAgentId', () => {
        it('should delete config and return true', async () => {
            // Ensure config exists
            await repo.upsert({ agent_id: TEST_AGENT_ID, sources: [] });

            const deleted = await repo.deleteByAgentId(TEST_AGENT_ID);

            expect(deleted).toBe(true);

            const config = await repo.getByAgentId(TEST_AGENT_ID);
            expect(config).toBeNull();
        });

        it('should return false when nothing to delete', async () => {
            const deleted = await repo.deleteByAgentId(999999);

            expect(deleted).toBe(false);
        });
    });

    describe('listEnabled', () => {
        it('should list only enabled configs', async () => {
            // Create an enabled config
            await repo.upsert({
                agent_id: TEST_AGENT_ID,
                enabled: true,
                sources: [],
            });

            const configs = await repo.listEnabled();

            const found = configs.find(c => c.agent_id === TEST_AGENT_ID);
            expect(found).toBeDefined();
            expect(found!.enabled).toBe(true);
        });
    });
});
