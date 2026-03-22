// Heartbeat State Repository Tests - Real Database
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });

import { query } from '../../../database/connection';
import { HeartbeatStateRepository, heartbeatStateRepository } from '../heartbeat-state.repository';

const TEST_USER_ID = 'test_hb_state_repo_' + Date.now();
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
        [`test-hb-state-agent-${Date.now()}`, userId, 'private']
    );
    return result.rows[0].id;
}

async function cleanupTestData(): Promise<void> {
    await query("DELETE FROM heartbeat_state WHERE agent_id IN (SELECT id FROM agent_registry WHERE slug LIKE 'test-hb-state-agent-%')");
    await query("DELETE FROM agent_registry WHERE slug LIKE 'test-hb-state-agent-%'");
    await query("DELETE FROM users WHERE user_id LIKE 'test_hb_state_repo_%'");
}

describe('HeartbeatStateRepository', () => {
    let repo: HeartbeatStateRepository;

    beforeAll(async () => {
        repo = heartbeatStateRepository;
        await cleanupTestData();
        await createTestUser(TEST_USER_ID);
        TEST_AGENT_ID = await createTestAgent(TEST_USER_ID);
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    describe('upsert', () => {
        it('should create a new heartbeat state row for an agent', async () => {
            const state = await repo.upsert(TEST_AGENT_ID);

            expect(state.agent_id).toBe(TEST_AGENT_ID);
            expect(state.consecutive_failures).toBe(0);
            expect(state.tokens_spent_today).toBe(0);
            expect(state.tokens_budget_today).toBe(50000);
            expect(state.last_run_at).toBeNull();
        });

        it('should return existing state on duplicate upsert', async () => {
            const state = await repo.upsert(TEST_AGENT_ID);

            expect(state.agent_id).toBe(TEST_AGENT_ID);
        });
    });

    describe('getByAgentId', () => {
        it('should return state for an existing agent', async () => {
            const state = await repo.getByAgentId(TEST_AGENT_ID);

            expect(state).not.toBeNull();
            expect(state!.agent_id).toBe(TEST_AGENT_ID);
        });

        it('should return null for a non-existent agent', async () => {
            const state = await repo.getByAgentId(999999);

            expect(state).toBeNull();
        });
    });

    describe('recordRunStart', () => {
        it('should record a successful run', async () => {
            const state = await repo.recordRunStart(TEST_AGENT_ID, 'success', 1500);

            expect(state).not.toBeNull();
            expect(state!.last_outcome).toBe('success');
            expect(state!.consecutive_failures).toBe(0);
            expect(state!.tokens_spent_today).toBeGreaterThanOrEqual(1500);
            expect(state!.last_run_at).not.toBeNull();
        });

        it('should increment consecutive_failures on failure', async () => {
            const before = await repo.getByAgentId(TEST_AGENT_ID);
            const state = await repo.recordRunStart(TEST_AGENT_ID, 'failure', 500, 'test error');

            expect(state).not.toBeNull();
            expect(state!.last_outcome).toBe('failure');
            expect(state!.consecutive_failures).toBe((before?.consecutive_failures ?? 0) + 1);
            expect(state!.last_error).toBe('test error');
        });

        it('should reset consecutive_failures on success after failures', async () => {
            const state = await repo.recordRunStart(TEST_AGENT_ID, 'success', 100);

            expect(state).not.toBeNull();
            expect(state!.consecutive_failures).toBe(0);
        });

        it('should return null for non-existent agent', async () => {
            const state = await repo.recordRunStart(999999, 'success', 100);

            expect(state).toBeNull();
        });
    });

    describe('resetDailyTokens', () => {
        it('should reset tokens_spent_today to zero', async () => {
            await repo.recordRunStart(TEST_AGENT_ID, 'success', 5000);
            const before = await repo.getByAgentId(TEST_AGENT_ID);
            expect(before!.tokens_spent_today).toBeGreaterThan(0);

            await repo.resetDailyTokens(TEST_AGENT_ID);

            const after = await repo.getByAgentId(TEST_AGENT_ID);
            expect(after!.tokens_spent_today).toBe(0);
        });
    });

    describe('updateNextScheduledAt', () => {
        it('should set the next scheduled time', async () => {
            const nextAt = new Date(Date.now() + 3600000);
            await repo.updateNextScheduledAt(TEST_AGENT_ID, nextAt);

            const state = await repo.getByAgentId(TEST_AGENT_ID);
            expect(state!.next_scheduled_at).not.toBeNull();
        });

        it('should clear the next scheduled time when set to null', async () => {
            await repo.updateNextScheduledAt(TEST_AGENT_ID, null);

            const state = await repo.getByAgentId(TEST_AGENT_ID);
            expect(state!.next_scheduled_at).toBeNull();
        });
    });

    describe('row-level locks', () => {
        it('should acquire and release lock', async () => {
            const acquired = await repo.tryAcquireLock(TEST_AGENT_ID, 'test-run-1', 60000);
            expect(acquired).toBe(true);

            await repo.releaseLock(TEST_AGENT_ID);
        });

        it('should fail to acquire lock when already held', async () => {
            const acquired1 = await repo.tryAcquireLock(TEST_AGENT_ID, 'test-run-2', 60000);
            expect(acquired1).toBe(true);

            const acquired2 = await repo.tryAcquireLock(TEST_AGENT_ID, 'test-run-3', 60000);
            expect(acquired2).toBe(false);

            await repo.releaseLock(TEST_AGENT_ID);
        });

        it('should acquire lock after release', async () => {
            const acquired1 = await repo.tryAcquireLock(TEST_AGENT_ID, 'test-run-4', 60000);
            expect(acquired1).toBe(true);
            await repo.releaseLock(TEST_AGENT_ID);

            const acquired2 = await repo.tryAcquireLock(TEST_AGENT_ID, 'test-run-5', 60000);
            expect(acquired2).toBe(true);
            await repo.releaseLock(TEST_AGENT_ID);
        });

        it('should acquire lock when previous lock has timed out', async () => {
            // Set suppressed_until to the past to simulate expired lock
            await query(
                `UPDATE heartbeat_state SET current_focus = 'expired-run', suppressed_until = NOW() - INTERVAL '1 second' WHERE agent_id = $1`,
                [TEST_AGENT_ID]
            );

            const acquired = await repo.tryAcquireLock(TEST_AGENT_ID, 'test-run-6', 60000);
            expect(acquired).toBe(true);

            await repo.releaseLock(TEST_AGENT_ID);
        });
    });

    describe('checkPauseState', () => {
        it('should return is_paused=false when no pause exists', async () => {
            const result = await repo.checkPauseState(TEST_AGENT_ID);

            expect(result.is_paused).toBe(false);
            expect(result.pause_id).toBeNull();
        });
    });
});
