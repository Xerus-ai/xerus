// Credit Tracker Service Tests
// Tests for execution-level credit tracking

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '..', '.env') });

import {
    CreditTracker,
    CreditTrackerDeps,
    ToolUsageRecord,
    SessionUsage,
} from '../credit-tracker.service';

// -----------------------------------------------------------------------------
// Mock Dependencies
// -----------------------------------------------------------------------------

class InMemoryCreditService {
    public deductions: Array<{ userId: string; amount: number }> = [];
    public refunds: Array<{ userId: string; amount: number }> = [];
    public currentBalance = 100;
    public shouldFail = false;

    async checkCredits(_userId: string, required: number): Promise<boolean> {
        return this.currentBalance >= required;
    }

    async deduct(userId: string, input: { amount: number }): Promise<{ balance: number }> {
        if (this.shouldFail) {
            throw new Error('Credit deduction failed');
        }
        this.deductions.push({ userId, amount: input.amount });
        this.currentBalance -= input.amount;
        return { balance: this.currentBalance };
    }

    async refund(userId: string, amount: number, _description?: string): Promise<{ balance: number }> {
        this.refunds.push({ userId, amount });
        this.currentBalance += amount;
        return { balance: this.currentBalance };
    }

    async getBalance(_userId: string): Promise<{ balance: number }> {
        return { balance: this.currentBalance };
    }

    clear(): void {
        this.deductions = [];
        this.refunds = [];
        this.currentBalance = 100;
        this.shouldFail = false;
    }
}

class InMemoryUsageStore {
    public records: ToolUsageRecord[] = [];

    async storeToolUsage(record: ToolUsageRecord): Promise<void> {
        this.records.push(record);
    }

    async getSessionUsage(sessionId: string): Promise<SessionUsage> {
        const sessionRecords = this.records.filter((r) => r.session_id === sessionId);
        const totalTokens = sessionRecords.reduce((sum, r) => sum + (r.tokens_used || 0), 0);
        const totalCredits = sessionRecords.reduce((sum, r) => sum + (r.credits_consumed || 0), 0);

        return {
            session_id: sessionId,
            total_input_tokens: totalTokens,
            total_output_tokens: 0,
            total_credits: totalCredits,
            tool_calls: sessionRecords.length,
        };
    }

    clear(): void {
        this.records = [];
    }
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('CreditTracker', () => {
    let tracker: CreditTracker;
    let inMemoryCreditService: InMemoryCreditService;
    let inMemoryUsageStore: InMemoryUsageStore;

    beforeEach(() => {
        inMemoryCreditService = new InMemoryCreditService();
        inMemoryUsageStore = new InMemoryUsageStore();

        const deps: CreditTrackerDeps = {
            creditService: inMemoryCreditService,
            usageStore: inMemoryUsageStore,
        };

        tracker = new CreditTracker(deps);
    });

    afterEach(() => {
        inMemoryCreditService.clear();
        inMemoryUsageStore.clear();
    });

    describe('recordToolUsage', () => {
        it('should record tool usage and store it', async () => {
            await tracker.recordToolUsage('user-123', 'Read', 500);

            expect(inMemoryUsageStore.records).toHaveLength(1);
            expect(inMemoryUsageStore.records[0]).toMatchObject({
                user_id: 'user-123',
                tool_name: 'Read',
                tokens_used: 500,
            });
        });

        it('should calculate credits from tokens', async () => {
            await tracker.recordToolUsage('user-123', 'Write', 1000);

            // Default: 1 credit per 1000 tokens (or fraction thereof)
            expect(inMemoryUsageStore.records[0].credits_consumed).toBeGreaterThan(0);
        });

        it('should include session_id when provided', async () => {
            tracker.setSessionId('session-abc');
            await tracker.recordToolUsage('user-123', 'Bash', 200);

            expect(inMemoryUsageStore.records[0].session_id).toBe('session-abc');
        });

        it('should include agent_slug when provided', async () => {
            tracker.setAgentSlug('agent-456');
            await tracker.recordToolUsage('user-123', 'Edit', 300);

            expect(inMemoryUsageStore.records[0].agent_slug).toBe('agent-456');
        });
    });

    describe('credit calculation', () => {
        it('should charge minimum 1 credit for any tool call', async () => {
            await tracker.recordToolUsage('user-123', 'Read', 10);

            expect(inMemoryUsageStore.records[0].credits_consumed).toBeGreaterThanOrEqual(1);
        });

        it('should scale credits with token usage', async () => {
            await tracker.recordToolUsage('user-123', 'Write', 5000);

            // More tokens = more credits
            expect(inMemoryUsageStore.records[0].credits_consumed).toBeGreaterThan(1);
        });
    });

    describe('checkCredits', () => {
        it('should return true when user has sufficient credits', async () => {
            inMemoryCreditService.currentBalance = 50;

            const result = await tracker.checkCredits('user-123', 10);

            expect(result).toBe(true);
        });

        it('should return false when user has insufficient credits', async () => {
            inMemoryCreditService.currentBalance = 5;

            const result = await tracker.checkCredits('user-123', 10);

            expect(result).toBe(false);
        });
    });

    describe('deductCredits', () => {
        it('should deduct credits from user balance', async () => {
            await tracker.deductCredits('user-123', 5);

            expect(inMemoryCreditService.deductions).toHaveLength(1);
            expect(inMemoryCreditService.deductions[0]).toEqual({
                userId: 'user-123',
                amount: 5,
            });
        });

        it('should return new balance after deduction', async () => {
            inMemoryCreditService.currentBalance = 100;

            const newBalance = await tracker.deductCredits('user-123', 25);

            expect(newBalance).toBe(75);
        });

        it('should throw on deduction failure', async () => {
            inMemoryCreditService.shouldFail = true;

            await expect(tracker.deductCredits('user-123', 5)).rejects.toThrow();
        });
    });

    describe('getSessionUsage', () => {
        it('should aggregate usage for a session', async () => {
            tracker.setSessionId('session-xyz');

            await tracker.recordToolUsage('user-123', 'Read', 500);
            await tracker.recordToolUsage('user-123', 'Write', 700);
            await tracker.recordToolUsage('user-123', 'Bash', 300);

            const usage = await tracker.getSessionUsage('session-xyz');

            expect(usage.session_id).toBe('session-xyz');
            expect(usage.total_input_tokens).toBe(1500);
            expect(usage.tool_calls).toBe(3);
            expect(usage.total_credits).toBeGreaterThan(0);
        });

        it('should return zero usage for unknown session', async () => {
            const usage = await tracker.getSessionUsage('unknown-session');

            expect(usage.total_input_tokens).toBe(0);
            expect(usage.tool_calls).toBe(0);
        });
    });

    describe('finalizeSession', () => {
        it('should deduct total credits at session end', async () => {
            tracker.setSessionId('session-final');

            await tracker.recordToolUsage('user-123', 'Read', 1000);
            await tracker.recordToolUsage('user-123', 'Write', 1000);

            const result = await tracker.finalizeSession('user-123', 'session-final');

            expect(result.total_credits_deducted).toBeGreaterThan(0);
            expect(inMemoryCreditService.deductions.length).toBeGreaterThan(0);
        });

        it('should return usage summary', async () => {
            tracker.setSessionId('session-summary');
            await tracker.recordToolUsage('user-123', 'Read', 500);

            const result = await tracker.finalizeSession('user-123', 'session-summary');

            expect(result.usage.total_input_tokens).toBe(500);
        });

        it('should throw on deduction failure during finalization', async () => {
            inMemoryCreditService.shouldFail = true;
            tracker.setSessionId('session-fail');
            await tracker.recordToolUsage('user-123', 'Read', 1000);

            await expect(
                tracker.finalizeSession('user-123', 'session-fail')
            ).rejects.toThrow('Credit deduction failed');
        });
    });

    describe('session context', () => {
        it('should track context across multiple calls', async () => {
            tracker.setSessionId('session-ctx');
            tracker.setAgentSlug('agent-789');

            await tracker.recordToolUsage('user-123', 'Read', 100);
            await tracker.recordToolUsage('user-123', 'Write', 200);

            expect(inMemoryUsageStore.records[0].session_id).toBe('session-ctx');
            expect(inMemoryUsageStore.records[0].agent_slug).toBe('agent-789');
            expect(inMemoryUsageStore.records[1].session_id).toBe('session-ctx');
            expect(inMemoryUsageStore.records[1].agent_slug).toBe('agent-789');
        });

        it('should reset context', async () => {
            tracker.setSessionId('session-1');
            tracker.setAgentSlug('agent-1');

            tracker.resetContext();

            // After reset, context should be undefined
            // Next record should not have session/agent
            await tracker.recordToolUsage('user-reset', 'Read', 100);

            expect(inMemoryUsageStore.records[0].session_id).toBeUndefined();
            expect(inMemoryUsageStore.records[0].agent_slug).toBeUndefined();
        });

        it('should track teammate_id for per-teammate billing', async () => {
            tracker.setTeammateId('teammate-abc');

            await tracker.recordToolUsage('user-123', 'Read', 100);

            expect(inMemoryUsageStore.records[0].teammate_id).toBe('teammate-abc');
        });

        it('should track heartbeat_id for per-heartbeat billing', async () => {
            tracker.setHeartbeatId('heartbeat-xyz');

            await tracker.recordToolUsage('user-123', 'Write', 200);

            expect(inMemoryUsageStore.records[0].heartbeat_id).toBe('heartbeat-xyz');
        });

        it('should track all context fields together', async () => {
            tracker.setSessionId('session-full');
            tracker.setAgentSlug('agent-42');
            tracker.setTeammateId('teammate-full');
            tracker.setHeartbeatId('heartbeat-full');

            await tracker.recordToolUsage('user-123', 'Bash', 500);

            const record = inMemoryUsageStore.records[0];
            expect(record.session_id).toBe('session-full');
            expect(record.agent_slug).toBe('agent-42');
            expect(record.teammate_id).toBe('teammate-full');
            expect(record.heartbeat_id).toBe('heartbeat-full');
        });

        it('should reset teammate_id and heartbeat_id with resetContext', async () => {
            tracker.setTeammateId('teammate-reset');
            tracker.setHeartbeatId('heartbeat-reset');

            tracker.resetContext();

            await tracker.recordToolUsage('user-123', 'Read', 100);

            expect(inMemoryUsageStore.records[0].teammate_id).toBeUndefined();
            expect(inMemoryUsageStore.records[0].heartbeat_id).toBeUndefined();
        });
    });
});
