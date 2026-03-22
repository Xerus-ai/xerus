// Heartbeat Execution Repository Tests - Real Database
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });

import { query } from '../../../database/connection';
import { HeartbeatExecutionRepository, heartbeatExecutionRepository } from '../heartbeat-execution.repository';
import { heartbeatConfigRepository } from '../heartbeat-config.repository';
import { CreateHeartbeatExecutionDTO } from '../types';

const TEST_USER_ID = 'test_heartbeat_exec_user_' + Date.now();
let TEST_AGENT_ID: number;
let TEST_CONFIG_ID: number;

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
        [`test-heartbeat-exec-agent-${Date.now()}`, userId, 'private']
    );
    return result.rows[0].id;
}

async function cleanupTestData(): Promise<void> {
    await query("DELETE FROM heartbeat_executions WHERE agent_id IN (SELECT id FROM agent_registry WHERE slug LIKE 'test-heartbeat-exec-agent-%')");
    await query("DELETE FROM heartbeat_configs WHERE user_id LIKE 'test_heartbeat%'");
    await query("DELETE FROM agent_registry WHERE slug LIKE 'test-heartbeat-exec-agent-%'");
    await query("DELETE FROM users WHERE user_id LIKE 'test_heartbeat%'");
}

describe('HeartbeatExecutionRepository', () => {
    let repository: HeartbeatExecutionRepository;

    beforeAll(async () => {
        repository = heartbeatExecutionRepository;
        await cleanupTestData();
        await createTestUser(TEST_USER_ID);
        TEST_AGENT_ID = await createTestAgent(TEST_USER_ID);

        const config = await heartbeatConfigRepository.upsert({
            agent_id: TEST_AGENT_ID,
            user_id: TEST_USER_ID,
            enabled: true,
        });
        TEST_CONFIG_ID = config.id;
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    const createValidExecutionData = (
        overrides: Partial<CreateHeartbeatExecutionDTO> = {}
    ): CreateHeartbeatExecutionDTO => ({
        agent_id: TEST_AGENT_ID,
        heartbeat_config_id: TEST_CONFIG_ID,
        trigger_type: 'scheduled',
        scheduled_at: new Date(),
        ...overrides,
    });

    describe('create', () => {
        it('should create a new heartbeat execution', async () => {
            const data = createValidExecutionData();

            const execution = await repository.create(data);

            expect(execution.id).toBeDefined();
            expect(execution.agent_id).toBe(TEST_AGENT_ID);
            expect(execution.heartbeat_config_id).toBe(TEST_CONFIG_ID);
            expect(execution.trigger_type).toBe('scheduled');
            expect(execution.status).toBe('queued');
            expect(execution.tokens_used).toBe(0);
            expect(execution.tool_calls_count).toBe(0);
        });

        it('should create execution with event trigger type', async () => {
            const data = createValidExecutionData({
                trigger_type: 'event',
                event_payload: { type: 'gmail.new_email', from: 'test@example.com' },
            });

            const execution = await repository.create(data);

            expect(execution.trigger_type).toBe('event');
            expect(execution.event_payload).toEqual({ type: 'gmail.new_email', from: 'test@example.com' });
        });

        it('should create execution with manual trigger type', async () => {
            const data = createValidExecutionData({
                trigger_type: 'manual',
                run_id: 'manual-run-123',
            });

            const execution = await repository.create(data);

            expect(execution.trigger_type).toBe('manual');
            expect(execution.run_id).toBe('manual-run-123');
        });

        it('should create execution without config_id (manual)', async () => {
            const data = createValidExecutionData({
                heartbeat_config_id: null,
                trigger_type: 'manual',
            });

            const execution = await repository.create(data);

            expect(execution.heartbeat_config_id).toBeNull();
        });
    });

    describe('getById', () => {
        it('should return execution by ID', async () => {
            const created = await repository.create(createValidExecutionData());

            const execution = await repository.getById(created.id);

            expect(execution).not.toBeNull();
            expect(execution!.id).toBe(created.id);
        });

        it('should return null for non-existent ID', async () => {
            const execution = await repository.getById('00000000-0000-0000-0000-000000000000');
            expect(execution).toBeNull();
        });
    });

    describe('listByAgentId', () => {
        beforeAll(async () => {
            for (let i = 0; i < 5; i++) {
                await repository.create(
                    createValidExecutionData({
                        scheduled_at: new Date(Date.now() - i * 60000),
                    })
                );
            }
        });

        it('should return paginated executions', async () => {
            const result = await repository.listByAgentId(TEST_AGENT_ID, {
                limit: 3,
                offset: 0,
            });

            expect(result.executions.length).toBeLessThanOrEqual(3);
            expect(result.total).toBeGreaterThanOrEqual(5);
            expect(result.limit).toBe(3);
            expect(result.offset).toBe(0);
        });

        it('should return executions ordered by scheduled_at DESC', async () => {
            const result = await repository.listByAgentId(TEST_AGENT_ID, { limit: 10 });

            for (let i = 1; i < result.executions.length; i++) {
                const prev = new Date(result.executions[i - 1].scheduled_at).getTime();
                const curr = new Date(result.executions[i].scheduled_at).getTime();
                expect(prev).toBeGreaterThanOrEqual(curr);
            }
        });

        it('should filter by status', async () => {
            const completedExec = await repository.create(createValidExecutionData());
            await repository.updateStatus(completedExec.id, 'completed', {
                outcome: 'success',
            });

            const result = await repository.listByAgentId(TEST_AGENT_ID, {
                status: 'completed',
            });

            result.executions.forEach((exec) => {
                expect(exec.status).toBe('completed');
            });
        });

        it('should support pagination offset', async () => {
            const fullResult = await repository.listByAgentId(TEST_AGENT_ID, { limit: 10, offset: 0 });
            const offsetResult = await repository.listByAgentId(TEST_AGENT_ID, { limit: 10, offset: 2 });

            if (fullResult.executions.length > 2) {
                expect(offsetResult.executions[0].id).toBe(fullResult.executions[2].id);
            }
        });
    });

    describe('getLatestByConfigId', () => {
        it('should return the latest execution for config', async () => {
            const newAgentId = await createTestAgent(TEST_USER_ID);
            const newConfig = await heartbeatConfigRepository.upsert({
                agent_id: newAgentId,
                user_id: TEST_USER_ID,
            });

            await repository.create({
                agent_id: newAgentId,
                heartbeat_config_id: newConfig.id,
                trigger_type: 'scheduled',
                scheduled_at: new Date(Date.now() - 60000),
            });

            const newerExec = await repository.create({
                agent_id: newAgentId,
                heartbeat_config_id: newConfig.id,
                trigger_type: 'scheduled',
                scheduled_at: new Date(),
            });

            const latest = await repository.getLatestByConfigId(newConfig.id);

            expect(latest).not.toBeNull();
            expect(latest!.id).toBe(newerExec.id);
        });

        it('should return null when no executions exist', async () => {
            const latest = await repository.getLatestByConfigId(999999);
            expect(latest).toBeNull();
        });
    });

    describe('getLatestByAgentId', () => {
        it('should return the latest execution for agent', async () => {
            const newAgentId = await createTestAgent(TEST_USER_ID);

            await repository.create({
                agent_id: newAgentId,
                trigger_type: 'scheduled',
                scheduled_at: new Date(Date.now() - 60000),
            });

            const newerExec = await repository.create({
                agent_id: newAgentId,
                trigger_type: 'scheduled',
                scheduled_at: new Date(),
            });

            const latest = await repository.getLatestByAgentId(newAgentId);

            expect(latest).not.toBeNull();
            expect(latest!.id).toBe(newerExec.id);
        });
    });

    describe('updateStatus', () => {
        it('should update status to running with started_at', async () => {
            const execution = await repository.create(createValidExecutionData());
            const startedAt = new Date();

            const updated = await repository.updateStatus(execution.id, 'running', {
                started_at: startedAt,
            });

            expect(updated).not.toBeNull();
            expect(updated!.status).toBe('running');
            expect(updated!.started_at).not.toBeNull();
        });

        it('should update status to completed with all metrics', async () => {
            const execution = await repository.create(createValidExecutionData());
            const completedAt = new Date();

            const updated = await repository.updateStatus(execution.id, 'completed', {
                started_at: new Date(Date.now() - 5000),
                completed_at: completedAt,
                outcome: 'success',
                result: { message: 'Processed 5 items' },
                duration_ms: 5000,
                tokens_used: 1500,
                tool_calls_count: 3,
                inbox_posts: 1,
                memory_updates: 2,
                alerts_sent: 0,
            });

            expect(updated).not.toBeNull();
            expect(updated!.status).toBe('completed');
            expect(updated!.outcome).toBe('success');
            expect(updated!.duration_ms).toBe(5000);
            expect(updated!.tokens_used).toBe(1500);
            expect(updated!.tool_calls_count).toBe(3);
            expect(updated!.inbox_posts).toBe(1);
            expect(updated!.memory_updates).toBe(2);
            expect(updated!.alerts_sent).toBe(0);
        });

        it('should update status to failed with error message', async () => {
            const execution = await repository.create(createValidExecutionData());

            const updated = await repository.updateStatus(execution.id, 'failed', {
                outcome: 'failure',
                error_message: 'Connection timeout',
            });

            expect(updated).not.toBeNull();
            expect(updated!.status).toBe('failed');
            expect(updated!.outcome).toBe('failure');
            expect(updated!.error_message).toBe('Connection timeout');
        });

        it('should update status to suppressed', async () => {
            const execution = await repository.create(createValidExecutionData());

            const updated = await repository.updateStatus(execution.id, 'suppressed', {
                outcome: 'suppressed',
            });

            expect(updated).not.toBeNull();
            expect(updated!.status).toBe('suppressed');
            expect(updated!.outcome).toBe('suppressed');
        });

        it('should return null for non-existent execution', async () => {
            const updated = await repository.updateStatus(
                '00000000-0000-0000-0000-000000000000',
                'running'
            );
            expect(updated).toBeNull();
        });
    });

    describe('countByAgentIdAndStatus', () => {
        it('should count executions by status', async () => {
            const newAgentId = await createTestAgent(TEST_USER_ID);

            await repository.create({
                agent_id: newAgentId,
                trigger_type: 'scheduled',
                scheduled_at: new Date(),
            });

            const count = await repository.countByAgentIdAndStatus(newAgentId, 'queued');

            expect(count).toBeGreaterThanOrEqual(1);
        });
    });

    describe('deleteByAgentId', () => {
        it('should delete all executions for agent', async () => {
            const newAgentId = await createTestAgent(TEST_USER_ID);

            await repository.create({
                agent_id: newAgentId,
                trigger_type: 'scheduled',
                scheduled_at: new Date(),
            });
            await repository.create({
                agent_id: newAgentId,
                trigger_type: 'scheduled',
                scheduled_at: new Date(),
            });

            const deleted = await repository.deleteByAgentId(newAgentId);

            expect(deleted).toBeGreaterThanOrEqual(2);

            const remaining = await repository.listByAgentId(newAgentId);
            expect(remaining.total).toBe(0);
        });
    });
});
