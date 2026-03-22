// Heartbeat Config Repository Tests - Real Database
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });

import { query } from '../../../database/connection';
import { HeartbeatConfigRepository, heartbeatConfigRepository } from '../heartbeat-config.repository';
import { CreateHeartbeatConfigDTO } from '../types';

const TEST_USER_ID = 'test_heartbeat_config_user_' + Date.now();
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
        [`test-heartbeat-agent-${Date.now()}`, userId, 'private']
    );
    return result.rows[0].id;
}

async function cleanupTestData(): Promise<void> {
    await query("DELETE FROM heartbeat_configs WHERE user_id LIKE 'test_heartbeat%'");
    await query("DELETE FROM agent_registry WHERE slug LIKE 'test-heartbeat-agent-%'");
    await query("DELETE FROM users WHERE user_id LIKE 'test_heartbeat%'");
}

describe('HeartbeatConfigRepository', () => {
    let repository: HeartbeatConfigRepository;

    beforeAll(async () => {
        repository = heartbeatConfigRepository;
        await cleanupTestData();
        await createTestUser(TEST_USER_ID);
        TEST_AGENT_ID = await createTestAgent(TEST_USER_ID);
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    const createValidConfigData = (overrides: Partial<CreateHeartbeatConfigDTO> = {}): CreateHeartbeatConfigDTO => ({
        agent_id: TEST_AGENT_ID,
        user_id: TEST_USER_ID,
        enabled: false,
        cron_expression: '0 */30 * * *',
        timezone: 'UTC',
        ...overrides,
    });

    describe('upsert', () => {
        it('should create a new heartbeat config', async () => {
            const data = createValidConfigData();

            const config = await repository.upsert(data);

            expect(config.id).toBeDefined();
            expect(config.agent_id).toBe(TEST_AGENT_ID);
            expect(config.user_id).toBe(TEST_USER_ID);
            expect(config.enabled).toBe(false);
            expect(config.cron_expression).toBe('0 */30 * * *');
            expect(config.timezone).toBe('UTC');
            expect(config.max_duration_seconds).toBe(300);
            expect(config.token_budget).toBe(8000);
            expect(config.suppress_token).toBe('HEARTBEAT_OK');
        });

        it('should update existing config on conflict', async () => {
            const initialData = createValidConfigData({ enabled: false });
            await repository.upsert(initialData);

            const updatedData = createValidConfigData({
                enabled: true,
                cron_expression: '0 * * * *',
            });
            const config = await repository.upsert(updatedData);

            expect(config.agent_id).toBe(TEST_AGENT_ID);
            expect(config.enabled).toBe(true);
            expect(config.cron_expression).toBe('0 * * * *');
        });

        it('should set optional fields correctly', async () => {
            const newAgentId = await createTestAgent(TEST_USER_ID);
            const data = createValidConfigData({
                agent_id: newAgentId,
                active_hours_start: '09:00',
                active_hours_end: '17:00',
                weekdays_only: true,
                prompt: 'Custom heartbeat prompt',
                tool_allowlist: ['gmail', 'slack'],
            });

            const config = await repository.upsert(data);

            expect(config.active_hours_start).toBe('09:00:00');
            expect(config.active_hours_end).toBe('17:00:00');
            expect(config.weekdays_only).toBe(true);
            expect(config.prompt).toBe('Custom heartbeat prompt');
            expect(config.tool_allowlist).toEqual(['gmail', 'slack']);
        });
    });

    describe('getByAgentId', () => {
        it('should return config for existing agent', async () => {
            const data = createValidConfigData();
            await repository.upsert(data);

            const config = await repository.getByAgentId(TEST_AGENT_ID);

            expect(config).not.toBeNull();
            expect(config!.agent_id).toBe(TEST_AGENT_ID);
        });

        it('should return null for non-existent agent', async () => {
            const config = await repository.getByAgentId(999999);
            expect(config).toBeNull();
        });
    });

    describe('getById', () => {
        it('should return config by ID', async () => {
            const data = createValidConfigData();
            const created = await repository.upsert(data);

            const config = await repository.getById(created.id);

            expect(config).not.toBeNull();
            expect(config!.id).toBe(created.id);
        });

        it('should return null for non-existent ID', async () => {
            const config = await repository.getById(999999);
            expect(config).toBeNull();
        });
    });

    describe('update', () => {
        it('should update specific fields', async () => {
            const newAgentId = await createTestAgent(TEST_USER_ID);
            await repository.upsert(createValidConfigData({ agent_id: newAgentId }));

            const updated = await repository.update(newAgentId, {
                enabled: true,
                cron_expression: '*/15 * * * *',
                timezone: 'America/New_York',
            });

            expect(updated).not.toBeNull();
            expect(updated!.enabled).toBe(true);
            expect(updated!.cron_expression).toBe('*/15 * * * *');
            expect(updated!.timezone).toBe('America/New_York');
        });

        it('should return existing config when no fields to update', async () => {
            const config = await repository.getByAgentId(TEST_AGENT_ID);
            const result = await repository.update(TEST_AGENT_ID, {});
            expect(result!.id).toBe(config!.id);
        });

        it('should return null for non-existent agent', async () => {
            const result = await repository.update(999999, { enabled: true });
            expect(result).toBeNull();
        });
    });

    describe('deleteByAgentId', () => {
        it('should delete config for agent', async () => {
            const newAgentId = await createTestAgent(TEST_USER_ID);
            await repository.upsert(createValidConfigData({ agent_id: newAgentId }));

            const deleted = await repository.deleteByAgentId(newAgentId);
            expect(deleted).toBe(true);

            const config = await repository.getByAgentId(newAgentId);
            expect(config).toBeNull();
        });

        it('should return false for non-existent agent', async () => {
            const deleted = await repository.deleteByAgentId(999999);
            expect(deleted).toBe(false);
        });
    });

    describe('listEnabled', () => {
        it('should return only enabled configs', async () => {
            const enabledAgentId = await createTestAgent(TEST_USER_ID);
            const disabledAgentId = await createTestAgent(TEST_USER_ID);

            await repository.upsert(createValidConfigData({ agent_id: enabledAgentId, enabled: true }));
            await repository.upsert(createValidConfigData({ agent_id: disabledAgentId, enabled: false }));

            const enabledConfigs = await repository.listEnabled();

            const hasEnabled = enabledConfigs.some((c) => c.agent_id === enabledAgentId);
            const hasDisabled = enabledConfigs.some((c) => c.agent_id === disabledAgentId);

            expect(hasEnabled).toBe(true);
            expect(hasDisabled).toBe(false);
        });
    });

    describe('listByUserId', () => {
        it('should return all configs for user', async () => {
            const configs = await repository.listByUserId(TEST_USER_ID);

            expect(configs.length).toBeGreaterThan(0);
            configs.forEach((config) => {
                expect(config.user_id).toBe(TEST_USER_ID);
            });
        });

        it('should return empty array for user with no configs', async () => {
            const configs = await repository.listByUserId('nonexistent_user');
            expect(configs).toEqual([]);
        });
    });
});
