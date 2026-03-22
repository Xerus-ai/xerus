// Credit Deduction Service
// Runner-backend credit protocol handler
// Handles: credit_check events, credit_response commands, session_ended deductions
// Circuit breaker: kills agent if >N credits/hour burned
// Spec: glass-y5v.4.113

import {
    CreditCheckEvent,
    SessionEndedEvent,
    CreditResponseCommand,
} from '../runner/runner.types';
import { InsufficientCreditsError } from '../../users/errors';
import { TOKENS_PER_CREDIT, type CreditService } from './credit-tracker.service';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface CreditCheckResult {
    approved: boolean;
    reserved_credits: number;
    balance_remaining: number;
    reason?: string;
}

export interface AgentCostBreakdown {
    agent: string;
    user_id: string;
    credits_last_hour: number;
    total_credits: number;
    session_count: number;
    by_trigger: {
        execute: number;
        heartbeat: number;
        message: number;
    };
}

export interface CreditDeductionConfig {
    max_credits_per_hour: number;
}

// Re-export CreditService from credit-tracker for backward compat
export type { CreditService as CreditDeductionCreditService } from './credit-tracker.service';

export interface CreditDeductionSessionStore {
    getSessionOwner(sessionId: string): Promise<{
        user_id: string;
        agent_id: number;
        workspace_id: string;
    } | null>;
    updateSessionUsage(sessionId: string, usage: {
        input_tokens: number;
        output_tokens: number;
        credits_used: number;
    }): Promise<void>;
}

export interface CreditDeductionDeps {
    creditService: CreditService;
    sessionStore: CreditDeductionSessionStore;
}

// Internal tracking entry for circuit breaker
interface UsageEntry {
    credits: number;
    timestamp: number;
    trigger?: 'execute' | 'heartbeat' | 'message';
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEFAULT_MAX_CREDITS_PER_HOUR = 500;
const ONE_HOUR_MS = 3_600_000;

// -----------------------------------------------------------------------------
// Credit Deduction Service
// -----------------------------------------------------------------------------

export class CreditDeductionService {
    private readonly deps: CreditDeductionDeps;
    private readonly config: CreditDeductionConfig;

    // Keyed by "userId:agentSlug" for per-user per-agent tracking
    private agentUsage = new Map<string, UsageEntry[]>();

    // Tracks reserved (pre-deducted) credits per session for refund calculation
    private sessionReservations = new Map<string, number>();

    constructor(deps: CreditDeductionDeps, config?: Partial<CreditDeductionConfig>) {
        this.deps = deps;
        this.config = {
            max_credits_per_hour: config?.max_credits_per_hour ?? DEFAULT_MAX_CREDITS_PER_HOUR,
        };
    }

    // -------------------------------------------------------------------------
    // Credit Check (Runner -> Backend) - Atomic Hold Pattern
    // -------------------------------------------------------------------------

    async handleCreditCheck(
        userId: string,
        event: CreditCheckEvent
    ): Promise<CreditCheckResult> {
        const estimatedCredits = this.estimateCredits(event.estimated_tokens);

        // Check circuit breaker first (in-memory, no DB race)
        const hourlyUsage = this.getHourlyUsage(userId, event.agent);
        if (hourlyUsage >= this.config.max_credits_per_hour) {
            return {
                approved: false,
                reserved_credits: 0,
                balance_remaining: 0,
                reason: `Agent circuit breaker tripped: ${hourlyUsage} credits used in last hour (limit: ${this.config.max_credits_per_hour})`,
            };
        }

        // Atomically deduct estimated credits upfront (hold pattern).
        // CreditService.deduct uses SELECT FOR UPDATE internally, so two
        // concurrent requests cannot both pass -- the second will see the
        // reduced balance and fail if insufficient.
        try {
            const result = await this.deps.creditService.deduct(userId, { amount: estimatedCredits });

            return {
                approved: true,
                reserved_credits: estimatedCredits,
                balance_remaining: result.balance,
            };
        } catch (error) {
            if (error instanceof InsufficientCreditsError) {
                return {
                    approved: false,
                    reserved_credits: 0,
                    balance_remaining: 0,
                    reason: `Insufficient credits: need ${estimatedCredits}, available ${error.available}`,
                };
            }
            throw error;
        }
    }

    // -------------------------------------------------------------------------
    // Build Credit Response Command (Backend -> Runner)
    // -------------------------------------------------------------------------

    buildCreditResponse(
        agentSlug: string,
        result: CreditCheckResult
    ): CreditResponseCommand {
        return {
            cmd: 'credit_response',
            agent: agentSlug,
            approved: result.approved,
            reserved_credits: result.reserved_credits,
            balance_remaining: result.balance_remaining,
            reason: result.reason,
        };
    }

    // -------------------------------------------------------------------------
    // Reserve Credits for a Session
    // -------------------------------------------------------------------------

    reserveCreditsForSession(sessionId: string, credits: number): void {
        this.sessionReservations.set(sessionId, credits);
    }

    getReservedCredits(sessionId: string): number {
        return this.sessionReservations.get(sessionId) ?? 0;
    }

    // -------------------------------------------------------------------------
    // Session Ended (Runner -> Backend) - Settle Reserved vs Actual
    // -------------------------------------------------------------------------

    async handleSessionEnded(event: SessionEndedEvent): Promise<void> {
        const sessionOwner = await this.deps.sessionStore.getSessionOwner(event.session_id);
        if (!sessionOwner) {
            throw new Error(`Session not found: ${event.session_id}`);
        }

        const totalTokens = event.usage.input_tokens + event.usage.output_tokens;
        const actualCredits = this.estimateCredits(totalTokens);

        // Update session usage in DB
        await this.deps.sessionStore.updateSessionUsage(event.session_id, {
            input_tokens: event.usage.input_tokens,
            output_tokens: event.usage.output_tokens,
            credits_used: actualCredits,
        });

        // Settle: compare reserved (pre-deducted) vs actual usage.
        // Reserved credits were already deducted atomically in handleCreditCheck.
        const reserved = this.sessionReservations.get(event.session_id) ?? 0;
        this.sessionReservations.delete(event.session_id);

        if (reserved > actualCredits) {
            // Over-reserved: refund the difference
            const refundAmount = reserved - actualCredits;
            await this.deps.creditService.refund(
                sessionOwner.user_id,
                refundAmount,
                `Session ${event.session_id} settlement: reserved ${reserved}, used ${actualCredits}`,
            );
        } else if (actualCredits > reserved) {
            // Under-reserved: deduct the shortfall
            const shortfall = actualCredits - reserved;
            await this.deps.creditService.deduct(sessionOwner.user_id, { amount: shortfall });
        }
        // If reserved === actualCredits, nothing to settle

        // Track for circuit breaker (always track actual usage)
        if (actualCredits > 0) {
            this.recordAgentUsage(sessionOwner.user_id, event.agent, actualCredits);
        }
    }

    // -------------------------------------------------------------------------
    // Circuit Breaker - Per-Agent Hourly Tracking
    // -------------------------------------------------------------------------

    recordAgentUsage(
        userId: string,
        agentSlug: string,
        credits: number,
        timestamp?: number,
        trigger?: 'execute' | 'heartbeat' | 'message'
    ): void {
        const key = `${userId}:${agentSlug}`;
        const now = Date.now();
        const oneHourAgo = now - ONE_HOUR_MS;

        // Prune entries older than 1 hour to prevent unbounded growth
        const entries = (this.agentUsage.get(key) ?? []).filter(
            (e) => e.timestamp >= oneHourAgo
        );
        entries.push({
            credits,
            timestamp: timestamp ?? now,
            trigger,
        });
        this.agentUsage.set(key, entries);

        // Evict inactive keys (no entries left after pruning)
        if (entries.length === 1 && this.agentUsage.size > 1000) {
            for (const [k, v] of this.agentUsage) {
                if (v.every((e) => e.timestamp < oneHourAgo)) {
                    this.agentUsage.delete(k);
                }
            }
        }
    }

    getAgentCostBreakdown(userId: string, agentSlug: string): AgentCostBreakdown {
        const key = `${userId}:${agentSlug}`;
        const entries = this.agentUsage.get(key) ?? [];

        const now = Date.now();
        const oneHourAgo = now - ONE_HOUR_MS;

        let creditsLastHour = 0;
        let totalCredits = 0;
        let sessionCount = 0;
        const byTrigger = { execute: 0, heartbeat: 0, message: 0 };

        for (const entry of entries) {
            totalCredits += entry.credits;
            sessionCount++;

            if (entry.timestamp >= oneHourAgo) {
                creditsLastHour += entry.credits;
            }

            if (entry.trigger) {
                byTrigger[entry.trigger] += entry.credits;
            }
        }

        return {
            agent: agentSlug,
            user_id: userId,
            credits_last_hour: creditsLastHour,
            total_credits: totalCredits,
            session_count: sessionCount,
            by_trigger: byTrigger,
        };
    }

    // -------------------------------------------------------------------------
    // Token-to-Credit Conversion
    // -------------------------------------------------------------------------

    estimateCredits(tokens: number): number {
        if (tokens <= 0) return 0;
        return Math.ceil(tokens / TOKENS_PER_CREDIT);
    }

    // -------------------------------------------------------------------------
    // Private Methods
    // -------------------------------------------------------------------------

    private getHourlyUsage(userId: string, agentSlug: string): number {
        const key = `${userId}:${agentSlug}`;
        const entries = this.agentUsage.get(key) ?? [];

        const oneHourAgo = Date.now() - ONE_HOUR_MS;
        let total = 0;

        for (const entry of entries) {
            if (entry.timestamp >= oneHourAgo) {
                total += entry.credits;
            }
        }

        return total;
    }
}

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------

export function createCreditDeductionService(
    deps: CreditDeductionDeps,
    config?: Partial<CreditDeductionConfig>
): CreditDeductionService {
    return new CreditDeductionService(deps, config);
}
