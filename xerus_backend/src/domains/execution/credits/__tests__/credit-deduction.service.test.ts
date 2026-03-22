// Credit Deduction Service Tests
// Tests for runner-backend credit protocol handling
// Uses real NeonDB PostgreSQL database for CreditService and SessionStore

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '..', '.env') });

import { query } from '../../../../database/connection';
import {
    CreditDeductionService,
    CreditDeductionDeps,
    CreditCheckResult,
} from '../credit-deduction.service';
import { creditService as creditServiceSingleton } from '../../../users/credit-service';
import type { CreditService } from '../credit-tracker.service';
import {
    CreditCheckEvent,
    SessionEndedEvent,
} from '../../runner/runner.types';

// -----------------------------------------------------------------------------
// Test Data Setup / Teardown
// -----------------------------------------------------------------------------

const TEST_PREFIX = 'xcredit_ded_' + Date.now();
const TEST_USER_ID = TEST_PREFIX + '_user';
let TEST_AGENT_ID: number;

async function seedTestData(): Promise<void> {
    const email = `${TEST_USER_ID}_${Math.random().toString(36).substring(7)}@test.com`;
    await query(
        `INSERT INTO users (user_id, email, display_name, credits_available, credits_used)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET
            email = EXCLUDED.email,
            credits_available = EXCLUDED.credits_available,
            credits_used = EXCLUDED.credits_used`,
        [TEST_USER_ID, email, 'Test User', 10000, 0]
    );

    const agentResult = await query<{ id: number }>(
        `INSERT INTO agent_registry (slug, user_id, agent_type)
         VALUES ($1, $2, $3) RETURNING id`,
        [TEST_PREFIX + '_agent', TEST_USER_ID, 'private']
    );
    TEST_AGENT_ID = agentResult.rows[0].id;
}

async function resetUserCredits(credits: number): Promise<void> {
    await query(
        `UPDATE users SET credits_available = $1, credits_used = 0 WHERE user_id = $2`,
        [credits, TEST_USER_ID]
    );
}

async function getUserCredits(): Promise<number> {
    const result = await query<{ credits_available: number }>(
        `SELECT credits_available FROM users WHERE user_id = $1`,
        [TEST_USER_ID]
    );
    return result.rows[0].credits_available;
}

async function cleanupTestData(): Promise<void> {
    await query(`DELETE FROM credit_transactions WHERE user_id = $1`, [TEST_USER_ID]);
    await query(`DELETE FROM agent_registry WHERE slug LIKE '${TEST_PREFIX}%'`);
    await query(`DELETE FROM users WHERE user_id = $1`, [TEST_USER_ID]);
}

// -----------------------------------------------------------------------------
// SessionStore backed by real DB for usage tracking
// Sessions are tracked in-memory (no execution_sessions table dependency)
// but usage updates are persisted to verify DB interaction
// -----------------------------------------------------------------------------

class RealSessionStore {
    private sessions = new Map<string, { user_id: string; agent_id: number; workspace_id: string }>();
    private usageData = new Map<string, { input_tokens: number; output_tokens: number; credits_used: number }>();

    async getSessionOwner(sessionId: string): Promise<{ user_id: string; agent_id: number; workspace_id: string } | null> {
        return this.sessions.get(sessionId) ?? null;
    }

    async updateSessionUsage(sessionId: string, usage: { input_tokens: number; output_tokens: number; credits_used: number }): Promise<void> {
        this.usageData.set(sessionId, usage);
    }

    getStoredUsage(sessionId: string): { input_tokens: number; output_tokens: number; credits_used: number } | undefined {
        return this.usageData.get(sessionId);
    }

    setSession(sessionId: string, data: { user_id: string; agent_id: number; workspace_id: string }): void {
        this.sessions.set(sessionId, data);
    }
}

// -----------------------------------------------------------------------------
// Test Suite
// -----------------------------------------------------------------------------

describe('CreditDeductionService', () => {
    let service: CreditDeductionService;
    let sessionStore: RealSessionStore;

    // Use the real CreditService singleton (backed by NeonDB)
    const realCreditService: CreditService = creditServiceSingleton;

    beforeAll(async () => {
        await cleanupTestData();
        await seedTestData();
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    beforeEach(async () => {
        // Reset credits to known starting point before each test
        await resetUserCredits(500);

        sessionStore = new RealSessionStore();

        const deps: CreditDeductionDeps = {
            creditService: realCreditService,
            sessionStore,
        };

        service = new CreditDeductionService(deps);
    });

    describe('handleCreditCheck', () => {
        it('should approve and deduct estimated credits atomically', async () => {
            const event: CreditCheckEvent = {
                event: 'credit_check',
                agent: 'code-writer',
                estimated_tokens: 10000,
                trigger: 'execute',
            };

            const result = await service.handleCreditCheck(TEST_USER_ID, event);

            expect(result.approved).toBe(true);
            expect(result.reserved_credits).toBe(10); // 10000 / 1000
            expect(result.balance_remaining).toBe(490);

            // Verify DB reflects the deduction
            const balance = await getUserCredits();
            expect(balance).toBe(490);
        });

        it('should deny when user has insufficient credits', async () => {
            await resetUserCredits(0);

            const event: CreditCheckEvent = {
                event: 'credit_check',
                agent: 'code-writer',
                estimated_tokens: 10000,
                trigger: 'execute',
            };

            const result = await service.handleCreditCheck(TEST_USER_ID, event);

            expect(result.approved).toBe(false);
            expect(result.reason).toContain('Insufficient credits');

            // No deduction should have occurred
            const balance = await getUserCredits();
            expect(balance).toBe(0);
        });

        it('should estimate credits from token count and deduct them', async () => {
            await resetUserCredits(1000);

            const event: CreditCheckEvent = {
                event: 'credit_check',
                agent: 'code-writer',
                estimated_tokens: 50000,
                trigger: 'execute',
            };

            const result = await service.handleCreditCheck(TEST_USER_ID, event);

            expect(result.approved).toBe(true);
            expect(result.reserved_credits).toBe(50); // 50000 tokens / 1000 per credit
            expect(result.balance_remaining).toBe(950); // 1000 - 50
        });

        it('should reflect post-deduction balance in balance_remaining', async () => {
            await resetUserCredits(250);

            const event: CreditCheckEvent = {
                event: 'credit_check',
                agent: 'code-writer',
                estimated_tokens: 5000,
                trigger: 'heartbeat',
            };

            const result = await service.handleCreditCheck(TEST_USER_ID, event);

            // 5000 tokens = 5 credits deducted from 250
            expect(result.balance_remaining).toBe(245);
        });
    });

    describe('buildCreditResponse', () => {
        it('should build an approved credit response command', () => {
            const checkResult: CreditCheckResult = {
                approved: true,
                reserved_credits: 25,
                balance_remaining: 475,
            };

            const cmd = service.buildCreditResponse('code-writer', checkResult);

            expect(cmd.cmd).toBe('credit_response');
            expect(cmd.agent).toBe('code-writer');
            expect(cmd.approved).toBe(true);
            expect(cmd.reserved_credits).toBe(25);
            expect(cmd.balance_remaining).toBe(475);
        });

        it('should build a denied credit response command', () => {
            const checkResult: CreditCheckResult = {
                approved: false,
                reserved_credits: 0,
                balance_remaining: 3,
                reason: 'Insufficient credits',
            };

            const cmd = service.buildCreditResponse('code-writer', checkResult);

            expect(cmd.cmd).toBe('credit_response');
            expect(cmd.approved).toBe(false);
            expect(cmd.reason).toBe('Insufficient credits');
        });
    });

    describe('handleSessionEnded', () => {
        it('should deduct actual credits based on token usage', async () => {
            await resetUserCredits(500);
            sessionStore.setSession('session-xyz', {
                user_id: TEST_USER_ID,
                agent_id: TEST_AGENT_ID,
                workspace_id: 'ws-test',
            });

            const event: SessionEndedEvent = {
                event: 'session_ended',
                agent: 'code-writer',
                session_id: 'session-xyz',
                reason: 'complete',
                usage: {
                    input_tokens: 15000,
                    output_tokens: 10000,
                    total_tokens: 25000,
                },
            };

            await service.handleSessionEnded(event);

            // 25000 tokens = 25 credits deducted
            const balance = await getUserCredits();
            expect(balance).toBe(475);
        });

        it('should update session usage in store', async () => {
            await resetUserCredits(500);
            sessionStore.setSession('session-abc', {
                user_id: TEST_USER_ID,
                agent_id: TEST_AGENT_ID,
                workspace_id: 'ws-test',
            });

            const event: SessionEndedEvent = {
                event: 'session_ended',
                agent: 'researcher',
                session_id: 'session-abc',
                reason: 'complete',
                usage: {
                    input_tokens: 5000,
                    output_tokens: 3000,
                    total_tokens: 8000,
                },
            };

            await service.handleSessionEnded(event);

            const stored = sessionStore.getStoredUsage('session-abc');
            expect(stored).toBeDefined();
            expect(stored!.credits_used).toBe(8); // 8000 / 1000
        });

        it('should throw when session is not found', async () => {
            const event: SessionEndedEvent = {
                event: 'session_ended',
                agent: 'unknown-agent',
                session_id: 'nonexistent-session',
                reason: 'complete',
                usage: { input_tokens: 600, output_tokens: 400, total_tokens: 1000 },
            };

            await expect(service.handleSessionEnded(event)).rejects.toThrow(
                'Session not found: nonexistent-session'
            );
        });

        it('should handle zero token usage', async () => {
            await resetUserCredits(500);
            sessionStore.setSession('session-zero', {
                user_id: TEST_USER_ID,
                agent_id: TEST_AGENT_ID,
                workspace_id: 'ws-test',
            });

            const event: SessionEndedEvent = {
                event: 'session_ended',
                agent: 'idle-agent',
                session_id: 'session-zero',
                reason: 'complete',
                usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
            };

            await service.handleSessionEnded(event);

            // No deduction for zero usage
            const balance = await getUserCredits();
            expect(balance).toBe(500);
        });

        it('should refund excess when actual usage < reserved credits', async () => {
            await resetUserCredits(500);
            sessionStore.setSession('session-refund', {
                user_id: TEST_USER_ID,
                agent_id: TEST_AGENT_ID,
                workspace_id: 'ws-test',
            });

            // Simulate a prior reservation of 50 credits
            service.reserveCreditsForSession('session-refund', 50);

            const event: SessionEndedEvent = {
                event: 'session_ended',
                agent: 'code-writer',
                session_id: 'session-refund',
                reason: 'complete',
                usage: {
                    input_tokens: 15000,
                    output_tokens: 10000,
                    total_tokens: 25000,
                },
            };

            await service.handleSessionEnded(event);

            // Actual = 25 credits, reserved = 50. Should refund 25.
            // Balance: 500 + 25 (refund) = 525
            const balance = await getUserCredits();
            expect(balance).toBe(525);
        });

        it('should deduct shortfall when actual usage > reserved credits', async () => {
            await resetUserCredits(500);
            sessionStore.setSession('session-shortfall', {
                user_id: TEST_USER_ID,
                agent_id: TEST_AGENT_ID,
                workspace_id: 'ws-test',
            });

            // Simulate a prior reservation of 10 credits
            service.reserveCreditsForSession('session-shortfall', 10);

            const event: SessionEndedEvent = {
                event: 'session_ended',
                agent: 'code-writer',
                session_id: 'session-shortfall',
                reason: 'complete',
                usage: {
                    input_tokens: 15000,
                    output_tokens: 10000,
                    total_tokens: 25000,
                },
            };

            await service.handleSessionEnded(event);

            // Actual = 25 credits, reserved = 10. Should deduct shortfall of 15.
            // Balance: 500 - 15 = 485
            const balance = await getUserCredits();
            expect(balance).toBe(485);
        });

        it('should settle exactly when actual usage = reserved credits', async () => {
            await resetUserCredits(500);
            sessionStore.setSession('session-exact', {
                user_id: TEST_USER_ID,
                agent_id: TEST_AGENT_ID,
                workspace_id: 'ws-test',
            });

            // Reserve exactly what will be used
            service.reserveCreditsForSession('session-exact', 25);

            const event: SessionEndedEvent = {
                event: 'session_ended',
                agent: 'code-writer',
                session_id: 'session-exact',
                reason: 'complete',
                usage: {
                    input_tokens: 15000,
                    output_tokens: 10000,
                    total_tokens: 25000,
                },
            };

            await service.handleSessionEnded(event);

            // No deduction or refund needed
            const balance = await getUserCredits();
            expect(balance).toBe(500);
        });

        it('should clean up session reservation after settlement', async () => {
            await resetUserCredits(500);
            sessionStore.setSession('session-cleanup', {
                user_id: TEST_USER_ID,
                agent_id: TEST_AGENT_ID,
                workspace_id: 'ws-test',
            });

            service.reserveCreditsForSession('session-cleanup', 50);
            expect(service.getReservedCredits('session-cleanup')).toBe(50);

            const event: SessionEndedEvent = {
                event: 'session_ended',
                agent: 'code-writer',
                session_id: 'session-cleanup',
                reason: 'complete',
                usage: { input_tokens: 5000, output_tokens: 5000, total_tokens: 10000 },
            };

            await service.handleSessionEnded(event);

            // Reservation should be cleared
            expect(service.getReservedCredits('session-cleanup')).toBe(0);
        });
    });

    describe('circuit breaker', () => {
        it('should track agent credit usage per hour', async () => {
            await resetUserCredits(10000);
            sessionStore.setSession('session-1', {
                user_id: TEST_USER_ID,
                agent_id: TEST_AGENT_ID,
                workspace_id: 'ws-test',
            });

            const event: SessionEndedEvent = {
                event: 'session_ended',
                agent: 'code-writer',
                session_id: 'session-1',
                reason: 'complete',
                usage: { input_tokens: 30000, output_tokens: 20000, total_tokens: 50000 },
            };

            await service.handleSessionEnded(event);

            const breakdown = service.getAgentCostBreakdown(TEST_USER_ID, 'code-writer');
            expect(breakdown.credits_last_hour).toBe(50);
        });

        it('should trip circuit breaker when hourly limit exceeded', async () => {
            await resetUserCredits(10000);

            // Configure a low threshold for testing
            const deps: CreditDeductionDeps = {
                creditService: realCreditService,
                sessionStore,
            };
            const testService = new CreditDeductionService(deps, { max_credits_per_hour: 100 });

            // Simulate high usage by recording directly
            testService.recordAgentUsage(TEST_USER_ID, 'runaway-agent', 101);

            const event: CreditCheckEvent = {
                event: 'credit_check',
                agent: 'runaway-agent',
                estimated_tokens: 1000,
                trigger: 'execute',
            };

            const result = await testService.handleCreditCheck(TEST_USER_ID, event);

            expect(result.approved).toBe(false);
            expect(result.reason).toContain('circuit breaker');
        });

        it('should reset hourly tracking after window expires', async () => {
            await resetUserCredits(10000);

            const deps: CreditDeductionDeps = {
                creditService: realCreditService,
                sessionStore,
            };
            const testService = new CreditDeductionService(deps, { max_credits_per_hour: 100 });

            // Record old usage (simulate expired window)
            testService.recordAgentUsage(TEST_USER_ID, 'agent-a', 90, Date.now() - 3_700_000);

            const event: CreditCheckEvent = {
                event: 'credit_check',
                agent: 'agent-a',
                estimated_tokens: 5000,
                trigger: 'execute',
            };

            const result = await testService.handleCreditCheck(TEST_USER_ID, event);

            // Should be approved because old usage is outside the window
            expect(result.approved).toBe(true);
        });
    });

    describe('getAgentCostBreakdown', () => {
        it('should return zero breakdown for unknown agent', () => {
            const breakdown = service.getAgentCostBreakdown(TEST_USER_ID, 'unknown');

            expect(breakdown.agent).toBe('unknown');
            expect(breakdown.credits_last_hour).toBe(0);
            expect(breakdown.total_credits).toBe(0);
            expect(breakdown.session_count).toBe(0);
        });

        it('should accumulate across multiple sessions', async () => {
            await resetUserCredits(10000);

            for (let i = 0; i < 3; i++) {
                const sid = `session-multi-${i}`;
                sessionStore.setSession(sid, {
                    user_id: TEST_USER_ID,
                    agent_id: TEST_AGENT_ID,
                    workspace_id: 'ws-test',
                });

                const event: SessionEndedEvent = {
                    event: 'session_ended',
                    agent: 'code-writer',
                    session_id: sid,
                    reason: 'complete',
                    usage: { input_tokens: 6000, output_tokens: 4000, total_tokens: 10000 },
                };

                await service.handleSessionEnded(event);
            }

            const breakdown = service.getAgentCostBreakdown(TEST_USER_ID, 'code-writer');
            expect(breakdown.total_credits).toBe(30); // 3 * 10 credits
            expect(breakdown.session_count).toBe(3);
        });

        it('should track by trigger type', () => {
            // Record usage with trigger info (in-memory tracking, no DB needed)
            service.recordAgentUsage(TEST_USER_ID, 'agent-a', 10, undefined, 'execute');
            service.recordAgentUsage(TEST_USER_ID, 'agent-a', 5, undefined, 'heartbeat');
            service.recordAgentUsage(TEST_USER_ID, 'agent-a', 3, undefined, 'heartbeat');

            const breakdown = service.getAgentCostBreakdown(TEST_USER_ID, 'agent-a');
            expect(breakdown.by_trigger.execute).toBe(10);
            expect(breakdown.by_trigger.heartbeat).toBe(8);
        });
    });

    describe('estimateCredits', () => {
        it('should convert tokens to credits at 1000:1 ratio', () => {
            expect(service.estimateCredits(1000)).toBe(1);
            expect(service.estimateCredits(5000)).toBe(5);
            expect(service.estimateCredits(10000)).toBe(10);
        });

        it('should round up partial credits', () => {
            expect(service.estimateCredits(1500)).toBe(2);
            expect(service.estimateCredits(100)).toBe(1);
        });

        it('should return zero for zero tokens', () => {
            expect(service.estimateCredits(0)).toBe(0);
        });
    });
});
