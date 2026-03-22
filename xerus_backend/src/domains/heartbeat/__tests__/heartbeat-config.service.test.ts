// Heartbeat Config Service Tests - Real Database
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });

import { query } from '../../../database/connection';
import { HeartbeatConfigService, heartbeatConfigService } from '../heartbeat-config.service';
import { heartbeatConfigRepository } from '../heartbeat-config.repository';
import { heartbeatExecutionRepository } from '../heartbeat-execution.repository';
import {
    HeartbeatConfigNotFoundError,
    AgentOwnershipError,
    AgentNotFoundForHeartbeatError,
} from '../errors';

const TEST_USER_ID = 'test_heartbeat_svc_user_' + Date.now();
const OTHER_USER_ID = 'test_heartbeat_svc_other_' + Date.now();
let TEST_AGENT_ID: number;
let OTHER_USER_AGENT_ID: number;

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
        [`test-heartbeat-svc-agent-${Date.now()}`, userId, 'private']
    );
    return result.rows[0].id;
}

async function cleanupTestData(): Promise<void> {
    await query("DELETE FROM heartbeat_executions WHERE agent_id IN (SELECT id FROM agent_registry WHERE slug LIKE 'test-heartbeat-svc-agent-%')");
    await query("DELETE FROM heartbeat_configs WHERE user_id LIKE 'test_heartbeat%'");
    await query("DELETE FROM agent_registry WHERE slug LIKE 'test-heartbeat-svc-agent-%'");
    await query("DELETE FROM users WHERE user_id LIKE 'test_heartbeat%'");
}

describe('HeartbeatConfigService', () => {
    let service: HeartbeatConfigService;

    beforeAll(async () => {
        service = heartbeatConfigService;
        await cleanupTestData();
        await createTestUser(TEST_USER_ID);
        await createTestUser(OTHER_USER_ID);
        TEST_AGENT_ID = await createTestAgent(TEST_USER_ID);
        OTHER_USER_AGENT_ID = await createTestAgent(OTHER_USER_ID);
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    describe('upsert', () => {
        it('should create config when user owns agent', async () => {
            const config = await service.upsert(
                {
                    agent_id: TEST_AGENT_ID,
                    enabled: true,
                    cron_expression: '0 */30 * * *',
                },
                TEST_USER_ID
            );

            expect(config.agent_id).toBe(TEST_AGENT_ID);
            expect(config.user_id).toBe(TEST_USER_ID);
            expect(config.enabled).toBe(true);
        });

        it('should throw AgentNotFoundForHeartbeatError for non-existent agent', async () => {
            await expect(
                service.upsert(
                    {
                        agent_id: 999999,
                    },
                    TEST_USER_ID
                )
            ).rejects.toThrow(AgentNotFoundForHeartbeatError);
        });

        it('should throw AgentOwnershipError when user does not own agent', async () => {
            await expect(
                service.upsert(
                    {
                        agent_id: OTHER_USER_AGENT_ID,
                    },
                    TEST_USER_ID
                )
            ).rejects.toThrow(AgentOwnershipError);
        });
    });

    describe('getByAgentId', () => {
        it('should return config when user owns agent', async () => {
            await heartbeatConfigRepository.upsert({
                agent_id: TEST_AGENT_ID,
                user_id: TEST_USER_ID,
            });

            const config = await service.getByAgentId(TEST_AGENT_ID, TEST_USER_ID);

            expect(config.agent_id).toBe(TEST_AGENT_ID);
        });

        it('should throw HeartbeatConfigNotFoundError when config does not exist', async () => {
            const newAgentId = await createTestAgent(TEST_USER_ID);

            await expect(service.getByAgentId(newAgentId, TEST_USER_ID)).rejects.toThrow(
                HeartbeatConfigNotFoundError
            );
        });

        it('should throw AgentOwnershipError when user does not own agent', async () => {
            await expect(service.getByAgentId(OTHER_USER_AGENT_ID, TEST_USER_ID)).rejects.toThrow(
                AgentOwnershipError
            );
        });
    });

    describe('getByAgentIdOrNull', () => {
        it('should return null when config does not exist', async () => {
            const newAgentId = await createTestAgent(TEST_USER_ID);

            const config = await service.getByAgentIdOrNull(newAgentId, TEST_USER_ID);

            expect(config).toBeNull();
        });

        it('should return config when exists', async () => {
            const config = await service.getByAgentIdOrNull(TEST_AGENT_ID, TEST_USER_ID);

            expect(config).not.toBeNull();
            expect(config!.agent_id).toBe(TEST_AGENT_ID);
        });
    });

    describe('update', () => {
        it('should update config when user owns agent', async () => {
            const updated = await service.update(
                TEST_AGENT_ID,
                { enabled: false, cron_expression: '0 * * * *' },
                TEST_USER_ID
            );

            expect(updated.enabled).toBe(false);
            expect(updated.cron_expression).toBe('0 * * * *');
        });

        it('should throw HeartbeatConfigNotFoundError when config does not exist', async () => {
            const newAgentId = await createTestAgent(TEST_USER_ID);

            await expect(
                service.update(newAgentId, { enabled: true }, TEST_USER_ID)
            ).rejects.toThrow(HeartbeatConfigNotFoundError);
        });

        it('should throw AgentOwnershipError when user does not own agent', async () => {
            await expect(
                service.update(OTHER_USER_AGENT_ID, { enabled: true }, TEST_USER_ID)
            ).rejects.toThrow(AgentOwnershipError);
        });
    });

    describe('delete', () => {
        it('should delete config when user owns agent', async () => {
            const newAgentId = await createTestAgent(TEST_USER_ID);
            await heartbeatConfigRepository.upsert({
                agent_id: newAgentId,
                user_id: TEST_USER_ID,
            });

            const deleted = await service.delete(newAgentId, TEST_USER_ID);

            expect(deleted).toBe(true);

            const config = await heartbeatConfigRepository.getByAgentId(newAgentId);
            expect(config).toBeNull();
        });

        it('should throw AgentOwnershipError when user does not own agent', async () => {
            await expect(service.delete(OTHER_USER_AGENT_ID, TEST_USER_ID)).rejects.toThrow(
                AgentOwnershipError
            );
        });
    });

    describe('enable and disable', () => {
        let enableTestAgentId: number;

        beforeAll(async () => {
            enableTestAgentId = await createTestAgent(TEST_USER_ID);
            await heartbeatConfigRepository.upsert({
                agent_id: enableTestAgentId,
                user_id: TEST_USER_ID,
                enabled: false,
            });
        });

        it('should enable config', async () => {
            const config = await service.enable(enableTestAgentId, TEST_USER_ID);
            expect(config.enabled).toBe(true);
        });

        it('should disable config', async () => {
            const config = await service.disable(enableTestAgentId, TEST_USER_ID);
            expect(config.enabled).toBe(false);
        });
    });

    describe('listExecutions', () => {
        let execTestAgentId: number;

        beforeAll(async () => {
            execTestAgentId = await createTestAgent(TEST_USER_ID);
            const config = await heartbeatConfigRepository.upsert({
                agent_id: execTestAgentId,
                user_id: TEST_USER_ID,
            });

            for (let i = 0; i < 3; i++) {
                await heartbeatExecutionRepository.create({
                    agent_id: execTestAgentId,
                    heartbeat_config_id: config.id,
                    trigger_type: 'scheduled',
                    scheduled_at: new Date(Date.now() - i * 60000),
                });
            }
        });

        it('should list executions when user owns agent', async () => {
            const result = await service.listExecutions(execTestAgentId, TEST_USER_ID, {
                limit: 10,
            });

            expect(result.executions.length).toBeGreaterThanOrEqual(3);
            expect(result.total).toBeGreaterThanOrEqual(3);
        });

        it('should throw AgentOwnershipError when user does not own agent', async () => {
            await expect(
                service.listExecutions(OTHER_USER_AGENT_ID, TEST_USER_ID)
            ).rejects.toThrow(AgentOwnershipError);
        });
    });

    describe('getLatestExecution', () => {
        let latestTestAgentId: number;

        beforeAll(async () => {
            latestTestAgentId = await createTestAgent(TEST_USER_ID);

            await heartbeatExecutionRepository.create({
                agent_id: latestTestAgentId,
                trigger_type: 'scheduled',
                scheduled_at: new Date(Date.now() - 60000),
            });

            await heartbeatExecutionRepository.create({
                agent_id: latestTestAgentId,
                trigger_type: 'scheduled',
                scheduled_at: new Date(),
            });
        });

        it('should return latest execution when user owns agent', async () => {
            const latest = await service.getLatestExecution(latestTestAgentId, TEST_USER_ID);

            expect(latest).not.toBeNull();
            expect(latest!.agent_id).toBe(latestTestAgentId);
        });

        it('should return null when no executions exist', async () => {
            const newAgentId = await createTestAgent(TEST_USER_ID);

            const latest = await service.getLatestExecution(newAgentId, TEST_USER_ID);

            expect(latest).toBeNull();
        });

        it('should throw AgentOwnershipError when user does not own agent', async () => {
            await expect(
                service.getLatestExecution(OTHER_USER_AGENT_ID, TEST_USER_ID)
            ).rejects.toThrow(AgentOwnershipError);
        });
    });
});
