// Credit Tracker Service
// Execution-level credit tracking for tool usage and session billing

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ToolUsageRecord {
    id?: string;
    user_id: string;
    agent_slug?: string;
    teammate_id?: string;
    heartbeat_id?: string;
    session_id?: string;
    tool_name: string;
    tokens_used: number;
    credits_consumed: number;
    created_at: Date;
}

export interface SessionUsage {
    session_id: string;
    total_input_tokens: number;
    total_output_tokens: number;
    total_credits: number;
    tool_calls: number;
}

export interface FinalizeResult {
    total_credits_deducted: number;
    usage: SessionUsage;
}

export interface CreditService {
    checkCredits(userId: string, required: number): Promise<boolean>;
    deduct(userId: string, input: { amount: number }): Promise<{ balance: number }>;
    refund(userId: string, amount: number, description?: string): Promise<{ balance: number }>;
    getBalance(userId: string): Promise<{ balance: number }>;
}

export interface UsageStore {
    storeToolUsage(record: ToolUsageRecord): Promise<void>;
    getSessionUsage(sessionId: string): Promise<SessionUsage>;
}

export interface CreditTrackerDeps {
    creditService: CreditService;
    usageStore: UsageStore;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

export const TOKENS_PER_CREDIT = 1000;
const MIN_CREDITS_PER_CALL = 1;

// -----------------------------------------------------------------------------
// Credit Tracker
// -----------------------------------------------------------------------------

export class CreditTracker {
    private readonly deps: CreditTrackerDeps;
    private sessionId?: string;
    private agentSlug?: string;
    private teammateId?: string;
    private heartbeatId?: string;

    constructor(deps: CreditTrackerDeps) {
        this.deps = deps;
    }

    // -------------------------------------------------------------------------
    // Session Context
    // -------------------------------------------------------------------------

    setSessionId(sessionId: string): void {
        this.sessionId = sessionId;
    }

    setAgentSlug(agentSlug: string): void {
        this.agentSlug = agentSlug;
    }

    setTeammateId(teammateId: string): void {
        this.teammateId = teammateId;
    }

    setHeartbeatId(heartbeatId: string): void {
        this.heartbeatId = heartbeatId;
    }

    resetContext(): void {
        this.sessionId = undefined;
        this.agentSlug = undefined;
        this.teammateId = undefined;
        this.heartbeatId = undefined;
    }

    // -------------------------------------------------------------------------
    // Tool Usage Recording
    // -------------------------------------------------------------------------

    async recordToolUsage(
        userId: string,
        toolName: string,
        tokensUsed: number
    ): Promise<void> {
        const creditsConsumed = this.calculateCredits(tokensUsed);

        const record: ToolUsageRecord = {
            user_id: userId,
            agent_slug: this.agentSlug,
            teammate_id: this.teammateId,
            heartbeat_id: this.heartbeatId,
            session_id: this.sessionId,
            tool_name: toolName,
            tokens_used: tokensUsed,
            credits_consumed: creditsConsumed,
            created_at: new Date(),
        };

        await this.deps.usageStore.storeToolUsage(record);
    }

    // -------------------------------------------------------------------------
    // Credit Operations
    // -------------------------------------------------------------------------

    async checkCredits(userId: string, required: number): Promise<boolean> {
        return this.deps.creditService.checkCredits(userId, required);
    }

    async deductCredits(userId: string, amount: number): Promise<number> {
        // CreditService.deduct uses SELECT FOR UPDATE internally, which atomically
        // checks balance and deducts. No separate getBalance check needed -- doing
        // a non-locked read first is a TOCTOU race (two concurrent callers can both
        // pass the check, then one deduction violates the constraint).
        const result = await this.deps.creditService.deduct(userId, { amount });
        return result.balance;
    }

    // -------------------------------------------------------------------------
    // Session Usage
    // -------------------------------------------------------------------------

    async getSessionUsage(sessionId: string): Promise<SessionUsage> {
        return this.deps.usageStore.getSessionUsage(sessionId);
    }

    async finalizeSession(
        userId: string,
        sessionId: string
    ): Promise<FinalizeResult> {
        const usage = await this.getSessionUsage(sessionId);
        let actualDeducted = 0;

        if (usage.total_credits > 0) {
            await this.deductCredits(userId, usage.total_credits);
            actualDeducted = usage.total_credits;
        }

        return {
            total_credits_deducted: actualDeducted,
            usage,
        };
    }

    // -------------------------------------------------------------------------
    // Private Methods
    // -------------------------------------------------------------------------

    private calculateCredits(tokens: number): number {
        if (tokens <= 0) return 0;
        return Math.max(Math.ceil(tokens / TOKENS_PER_CREDIT), MIN_CREDITS_PER_CALL);
    }
}

// -----------------------------------------------------------------------------
// Factory Function
// -----------------------------------------------------------------------------

export function createCreditTracker(deps: CreditTrackerDeps): CreditTracker {
    return new CreditTracker(deps);
}
