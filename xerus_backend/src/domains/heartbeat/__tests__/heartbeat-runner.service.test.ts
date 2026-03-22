// Heartbeat Runner Service Tests - Real Database
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });

import { query } from '../../../database/connection';
import { HeartbeatRunnerService, HeartbeatDispatchFn } from '../heartbeat-runner.service';
import { heartbeatConfigRepository } from '../heartbeat-config.repository';
import { heartbeatExecutionRepository } from '../heartbeat-execution.repository';
import { heartbeatStateRepository } from '../heartbeat-state.repository';
import { HeartbeatStaggerService } from '../heartbeat-stagger.service';
import {
    HeartbeatConfigNotFoundError,
    HeartbeatAgentBusyError,
    HeartbeatBudgetExceededError,
} from '../errors';

const TEST_USER_ID = 'test_hb_runner_' + Date.now();
const TEST_AGENT_IDS: number[] = [];

const successDispatch: HeartbeatDispatchFn = async (request) => {
    return {
        execution_id: 'exec_' + request.run_id,
        tokens_used: 1000,
        outcome: 'success',
    };
};

async function createTestUser(userId: string): Promise<void> {
    const uniqueEmail = `${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}@test.com`;
    await query(
        `INSERT INTO users (user_id, email, display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email`,
        [userId, uniqueEmail, 'Test User']
    );
}

async function createTestAgent(userId: string, suffix: string = ''): Promise<number> {
    const slug = `test-hb-runner-agent-${suffix}-${Date.now()}`.replace(/\s+/g, '-').toLowerCase();
    const result = await query<{ id: number }>(
        `INSERT INTO agent_registry (slug, user_id, agent_type)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [slug, userId, 'private']
    );
    TEST_AGENT_IDS.push(result.rows[0].id);
    return result.rows[0].id;
}

async function cleanupTestData(): Promise<void> {
    await query("DELETE FROM heartbeat_executions WHERE agent_id IN (SELECT id FROM agent_registry WHERE slug LIKE 'test-hb-runner-agent-%')");
    await query("DELETE FROM heartbeat_state WHERE agent_id IN (SELECT id FROM agent_registry WHERE slug LIKE 'test-hb-runner-agent-%')");
    await query("DELETE FROM heartbeat_configs WHERE user_id LIKE 'test_hb_runner_%'");
    await query("DELETE FROM agent_registry WHERE slug LIKE 'test-hb-runner-agent-%'");
    await query("DELETE FROM users WHERE user_id LIKE 'test_hb_runner_%'");
}

describe('HeartbeatRunnerService', () => {
    let runner: HeartbeatRunnerService;

    beforeAll(async () => {
        await cleanupTestData();
        await createTestUser(TEST_USER_ID);
    });

    afterAll(async () => {
        if (runner?.isRunning()) {
            runner.stop();
        }
        // Release any lingering locks
        for (const agentId of TEST_AGENT_IDS) {
            await heartbeatStateRepository.releaseLock(agentId).catch(() => {});
        }
        await cleanupTestData();
    });

    beforeEach(() => {
        runner = new HeartbeatRunnerService(
            heartbeatConfigRepository,
            heartbeatExecutionRepository,
            heartbeatStateRepository,
            new HeartbeatStaggerService(heartbeatConfigRepository)
        );
    });

    afterEach(async () => {
        if (runner.isRunning()) {
            runner.stop();
        }
        // Clean up any locks
        for (const agentId of TEST_AGENT_IDS) {
            await heartbeatStateRepository.releaseLock(agentId).catch(() => {});
        }
    });

    describe('start and stop', () => {
        it('should start the runner and register enabled agents', async () => {
            const agentId = await createTestAgent(TEST_USER_ID, 'start');
            await heartbeatConfigRepository.upsert({
                agent_id: agentId,
                user_id: TEST_USER_ID,
                enabled: true,
                cron_expression: '0 */30 * * *',
            });

            await runner.start(successDispatch);

            expect(runner.isRunning()).toBe(true);
            expect(runner.getRegisteredAgentIds()).toContain(agentId);
        });

        it('should stop the runner and clear all tasks', async () => {
            const agentId = await createTestAgent(TEST_USER_ID, 'stop');
            await heartbeatConfigRepository.upsert({
                agent_id: agentId,
                user_id: TEST_USER_ID,
                enabled: true,
                cron_expression: '0 */30 * * *',
            });

            await runner.start(successDispatch);
            runner.stop();

            expect(runner.isRunning()).toBe(false);
            expect(runner.getRegisteredAgentIds()).toHaveLength(0);
        });

        it('should be idempotent on multiple start calls', async () => {
            await runner.start(successDispatch);
            await runner.start(successDispatch);

            expect(runner.isRunning()).toBe(true);
        });

        it('should be idempotent on multiple stop calls', () => {
            runner.stop();
            runner.stop();

            expect(runner.isRunning()).toBe(false);
        });
    });

    describe('registerAgent', () => {
        it('should not register disabled agents', async () => {
            const agentId = await createTestAgent(TEST_USER_ID, 'disabled');
            const config = await heartbeatConfigRepository.upsert({
                agent_id: agentId,
                user_id: TEST_USER_ID,
                enabled: false,
                cron_expression: '0 */30 * * *',
            });

            runner.registerAgent(config);

            expect(runner.getRegisteredAgentIds()).not.toContain(agentId);
        });

        it('should register enabled agents', async () => {
            const agentId = await createTestAgent(TEST_USER_ID, 'enabled');
            const config = await heartbeatConfigRepository.upsert({
                agent_id: agentId,
                user_id: TEST_USER_ID,
                enabled: true,
                cron_expression: '0 */30 * * *',
            });

            runner.registerAgent(config);

            expect(runner.getRegisteredAgentIds()).toContain(agentId);
        });

        it('should replace existing registration on re-register', async () => {
            const agentId = await createTestAgent(TEST_USER_ID, 'reregister');
            const config1 = await heartbeatConfigRepository.upsert({
                agent_id: agentId,
                user_id: TEST_USER_ID,
                enabled: true,
                cron_expression: '0 */30 * * *',
            });

            runner.registerAgent(config1);
            expect(runner.getRegisteredAgentIds()).toContain(agentId);

            const config2 = await heartbeatConfigRepository.update(agentId, {
                cron_expression: '*/15 * * * *',
            });

            runner.registerAgent(config2!);
            expect(runner.getRegisteredAgentIds()).toContain(agentId);
            // Still just one registration for this agent
            expect(runner.getRegisteredAgentIds().filter((id) => id === agentId)).toHaveLength(1);
        });
    });

    describe('unregisterAgent', () => {
        it('should remove agent from scheduled tasks', async () => {
            const agentId = await createTestAgent(TEST_USER_ID, 'unreg');
            const config = await heartbeatConfigRepository.upsert({
                agent_id: agentId,
                user_id: TEST_USER_ID,
                enabled: true,
                cron_expression: '0 */30 * * *',
            });

            runner.registerAgent(config);
            expect(runner.getRegisteredAgentIds()).toContain(agentId);

            runner.unregisterAgent(agentId);
            expect(runner.getRegisteredAgentIds()).not.toContain(agentId);
        });

        it('should be safe to unregister non-existent agent', () => {
            runner.unregisterAgent(999999);
        });
    });

    describe('runHeartbeatOnce', () => {
        it('should successfully execute a heartbeat', async () => {
            const agentId = await createTestAgent(TEST_USER_ID, 'run-success');
            await heartbeatConfigRepository.upsert({
                agent_id: agentId,
                user_id: TEST_USER_ID,
                enabled: true,
                cron_expression: '0 */30 * * *',
            });
            await heartbeatStateRepository.upsert(agentId);

            await runner.start(successDispatch);

            const result = await runner.runHeartbeatOnce(agentId, 'manual');

            expect(result.skipped).toBe(false);
            expect(result.agent_id).toBe(agentId);
            expect(result.trigger_type).toBe('manual');
            expect(result.run_id).toBeDefined();
            expect(result.execution_id).toBeDefined();
        });

        it('should skip when config is disabled', async () => {
            const agentId = await createTestAgent(TEST_USER_ID, 'run-disabled');
            await heartbeatConfigRepository.upsert({
                agent_id: agentId,
                user_id: TEST_USER_ID,
                enabled: false,
                cron_expression: '0 */30 * * *',
            });

            await runner.start(successDispatch);

            const result = await runner.runHeartbeatOnce(agentId, 'scheduled');

            expect(result.skipped).toBe(true);
            expect(result.skip_reason).toBe('disabled');
        });

        it('should throw HeartbeatConfigNotFoundError for unknown agent', async () => {
            await runner.start(successDispatch);

            await expect(
                runner.runHeartbeatOnce(999999, 'manual')
            ).rejects.toThrow(HeartbeatConfigNotFoundError);
        });

        it('should skip scheduled heartbeat when lock is held', async () => {
            const agentId = await createTestAgent(TEST_USER_ID, 'run-locked');
            await heartbeatConfigRepository.upsert({
                agent_id: agentId,
                user_id: TEST_USER_ID,
                enabled: true,
                cron_expression: '0 */30 * * *',
            });
            await heartbeatStateRepository.upsert(agentId);

            await runner.start(successDispatch);

            // Acquire lock manually to simulate another heartbeat running
            const acquired = await heartbeatStateRepository.tryAcquireLock(agentId, 'blocking-run', 60000);
            expect(acquired).toBe(true);

            try {
                const result = await runner.runHeartbeatOnce(agentId, 'scheduled');
                expect(result.skipped).toBe(true);
                expect(result.skip_reason).toBe('locked');
            } finally {
                await heartbeatStateRepository.releaseLock(agentId);
            }
        });

        it('should throw HeartbeatAgentBusyError for manual when lock is held', async () => {
            const agentId = await createTestAgent(TEST_USER_ID, 'run-busy');
            await heartbeatConfigRepository.upsert({
                agent_id: agentId,
                user_id: TEST_USER_ID,
                enabled: true,
                cron_expression: '0 */30 * * *',
            });
            await heartbeatStateRepository.upsert(agentId);

            await runner.start(successDispatch);

            const acquired = await heartbeatStateRepository.tryAcquireLock(agentId, 'blocking-run', 60000);
            expect(acquired).toBe(true);

            try {
                await expect(
                    runner.runHeartbeatOnce(agentId, 'manual')
                ).rejects.toThrow(HeartbeatAgentBusyError);
            } finally {
                await heartbeatStateRepository.releaseLock(agentId);
            }
        });

        it('should skip scheduled heartbeat when budget is exceeded', async () => {
            const agentId = await createTestAgent(TEST_USER_ID, 'run-budget');
            await heartbeatConfigRepository.upsert({
                agent_id: agentId,
                user_id: TEST_USER_ID,
                enabled: true,
                cron_expression: '0 */30 * * *',
            });
            await heartbeatStateRepository.upsert(agentId);

            // Set tokens spent to exceed budget
            await query(
                'UPDATE heartbeat_state SET tokens_spent_today = 60000, tokens_budget_today = 50000 WHERE agent_id = $1',
                [agentId]
            );

            await runner.start(successDispatch);

            const result = await runner.runHeartbeatOnce(agentId, 'scheduled');
            expect(result.skipped).toBe(true);
            expect(result.skip_reason).toBe('budget_exceeded');
        });

        it('should throw HeartbeatBudgetExceededError for manual when budget exceeded', async () => {
            const agentId = await createTestAgent(TEST_USER_ID, 'run-budget-manual');
            await heartbeatConfigRepository.upsert({
                agent_id: agentId,
                user_id: TEST_USER_ID,
                enabled: true,
                cron_expression: '0 */30 * * *',
            });
            await heartbeatStateRepository.upsert(agentId);

            await query(
                'UPDATE heartbeat_state SET tokens_spent_today = 60000, tokens_budget_today = 50000 WHERE agent_id = $1',
                [agentId]
            );

            await runner.start(successDispatch);

            await expect(
                runner.runHeartbeatOnce(agentId, 'manual')
            ).rejects.toThrow(HeartbeatBudgetExceededError);
        });

        it('should update heartbeat state after successful run', async () => {
            const agentId = await createTestAgent(TEST_USER_ID, 'run-state-update');
            await heartbeatConfigRepository.upsert({
                agent_id: agentId,
                user_id: TEST_USER_ID,
                enabled: true,
                cron_expression: '0 */30 * * *',
            });
            await heartbeatStateRepository.upsert(agentId);
            await heartbeatStateRepository.resetDailyTokens(agentId);

            await runner.start(successDispatch);
            await runner.runHeartbeatOnce(agentId, 'manual');

            const state = await heartbeatStateRepository.getByAgentId(agentId);
            expect(state).not.toBeNull();
            expect(state!.last_outcome).toBe('success');
            expect(state!.tokens_spent_today).toBeGreaterThanOrEqual(1000);
            expect(state!.last_run_at).not.toBeNull();
        });

        it('should create execution record for successful run', async () => {
            const agentId = await createTestAgent(TEST_USER_ID, 'run-exec-record');
            await heartbeatConfigRepository.upsert({
                agent_id: agentId,
                user_id: TEST_USER_ID,
                enabled: true,
                cron_expression: '0 */30 * * *',
            });
            await heartbeatStateRepository.upsert(agentId);

            await runner.start(successDispatch);

            const result = await runner.runHeartbeatOnce(agentId, 'manual');

            const latest = await heartbeatExecutionRepository.getLatestByAgentId(agentId);
            expect(latest).not.toBeNull();
            expect(latest!.trigger_type).toBe('manual');
            expect(latest!.status).toBe('completed');
            expect(latest!.run_id).toBe(result.run_id);
        });

        it('should skip weekend for weekdays_only config', async () => {
            const agentId = await createTestAgent(TEST_USER_ID, 'run-weekday');
            await heartbeatConfigRepository.upsert({
                agent_id: agentId,
                user_id: TEST_USER_ID,
                enabled: true,
                cron_expression: '0 */30 * * *',
                weekdays_only: true,
            });
            await heartbeatStateRepository.upsert(agentId);

            await runner.start(successDispatch);

            // This test will behave differently on weekdays vs weekends
            const now = new Date();
            const day = now.getDay();
            const isWeekend = day === 0 || day === 6;

            const result = await runner.runHeartbeatOnce(agentId, 'scheduled');

            if (isWeekend) {
                expect(result.skipped).toBe(true);
                expect(result.skip_reason).toBe('weekend');
            } else {
                expect(result.skipped).toBe(false);
            }
        });
    });

    describe('forceRun', () => {
        it('should execute heartbeat for valid user/agent', async () => {
            const agentId = await createTestAgent(TEST_USER_ID, 'force-valid');
            await heartbeatConfigRepository.upsert({
                agent_id: agentId,
                user_id: TEST_USER_ID,
                enabled: true,
                cron_expression: '0 */30 * * *',
            });
            await heartbeatStateRepository.upsert(agentId);

            await runner.start(successDispatch);

            const result = await runner.forceRun(agentId, TEST_USER_ID);
            expect(result.skipped).toBe(false);
            expect(result.trigger_type).toBe('manual');
        });

        it('should throw HeartbeatConfigNotFoundError for unknown agent', async () => {
            await runner.start(successDispatch);

            await expect(
                runner.forceRun(999999, TEST_USER_ID)
            ).rejects.toThrow(HeartbeatConfigNotFoundError);
        });

        it('should throw HeartbeatConfigNotFoundError for wrong user', async () => {
            const agentId = await createTestAgent(TEST_USER_ID, 'force-wrong-user');
            await heartbeatConfigRepository.upsert({
                agent_id: agentId,
                user_id: TEST_USER_ID,
                enabled: true,
                cron_expression: '0 */30 * * *',
            });

            await runner.start(successDispatch);

            await expect(
                runner.forceRun(agentId, 'wrong_user_id')
            ).rejects.toThrow(HeartbeatConfigNotFoundError);
        });
    });

    describe('dispatch failure handling', () => {
        it('should record failure in heartbeat state on dispatch error', async () => {
            const agentId = await createTestAgent(TEST_USER_ID, 'dispatch-fail');
            await heartbeatConfigRepository.upsert({
                agent_id: agentId,
                user_id: TEST_USER_ID,
                enabled: true,
                cron_expression: '0 */30 * * *',
            });
            await heartbeatStateRepository.upsert(agentId);

            const failingDispatch: HeartbeatDispatchFn = async () => {
                throw new Error('Dispatch failed');
            };

            const failRunner = new HeartbeatRunnerService(
                heartbeatConfigRepository,
                heartbeatExecutionRepository,
                heartbeatStateRepository,
                new HeartbeatStaggerService(heartbeatConfigRepository)
            );

            await failRunner.start(failingDispatch);

            await expect(
                failRunner.runHeartbeatOnce(agentId, 'manual')
            ).rejects.toThrow('Dispatch failed');

            const state = await heartbeatStateRepository.getByAgentId(agentId);
            expect(state).not.toBeNull();
            expect(state!.last_outcome).toBe('failure');
            expect(state!.last_error).toBe('Dispatch failed');

            failRunner.stop();
        });

        it('should release advisory lock even after dispatch failure', async () => {
            const agentId = await createTestAgent(TEST_USER_ID, 'lock-release');
            await heartbeatConfigRepository.upsert({
                agent_id: agentId,
                user_id: TEST_USER_ID,
                enabled: true,
                cron_expression: '0 */30 * * *',
            });
            await heartbeatStateRepository.upsert(agentId);

            const failingDispatch: HeartbeatDispatchFn = async () => {
                throw new Error('Dispatch failed');
            };

            const failRunner = new HeartbeatRunnerService(
                heartbeatConfigRepository,
                heartbeatExecutionRepository,
                heartbeatStateRepository,
                new HeartbeatStaggerService(heartbeatConfigRepository)
            );

            await failRunner.start(failingDispatch);

            await failRunner.runHeartbeatOnce(agentId, 'manual').catch(() => {});

            // Lock should be released - we should be able to acquire it again
            const canAcquire = await heartbeatStateRepository.tryAcquireLock(agentId, 'verify-run', 60000);
            expect(canAcquire).toBe(true);
            await heartbeatStateRepository.releaseLock(agentId);

            failRunner.stop();
        });
    });
});
