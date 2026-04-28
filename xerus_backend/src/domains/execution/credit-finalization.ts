// Credit Finalization — deducts credits after execution and emits low-balance warnings.
// Extracted from execution-pipeline.ts to keep the pipeline under 400 lines.

import { logger } from '../../utils/logger';
import { SDKExecutionError } from './errors';
import { PLAN_CREDITS, type PlanType } from '../users/types';
import type { ResolvedExecutionDeps, PipelineContext } from './execution-pipeline.types';

const log = logger('CreditFinalization');

// -----------------------------------------------------------------------------
// Credit Finalization
// -----------------------------------------------------------------------------

export async function finalizeCredits(
    deps: ResolvedExecutionDeps,
    ctx: PipelineContext,
): Promise<{ total_credits_deducted: number }> {
    if (!ctx.sessionId) {
        throw new SDKExecutionError('Cannot finalize credits: sessionId is missing (pipeline invariant violated)');
    }

    // BYOK users: track usage for analytics but skip credit deduction
    if (ctx.keySource === 'byok') {
        const usage = await deps.creditTracker.getSessionUsage(ctx.sessionId);
        log.info('BYOK execution tracked (no credits deducted)', { execution_id: ctx.executionId, total_tokens: usage.total_input_tokens + usage.total_output_tokens });
        return { total_credits_deducted: 0 };
    }

    // Platform key users: pre-check credit balance before deduction to avoid constraint violations
    const preCheck = await deps.db.query<{ credits_available: number }>(
        'SELECT credits_available FROM users WHERE user_id = $1',
        [ctx.request.userId],
    );
    const currentBalance = preCheck.rows[0]?.credits_available;
    if (currentBalance === undefined) {
        throw new SDKExecutionError(`User ${ctx.request.userId} not found during credit finalization`);
    }

    const sessionUsage = await deps.creditTracker.getSessionUsage(ctx.sessionId);
    const totalCreditsUsed = sessionUsage.total_credits ?? 0;

    // If credits would go negative, deduct only what's available
    if (totalCreditsUsed > 0 && currentBalance < totalCreditsUsed) {
        log.warn('Mid-execution credit exhaustion — deducting remaining balance to zero', {
            execution_id: ctx.executionId,
            user_id: ctx.request.userId,
            credits_available: currentBalance,
            credits_requested: totalCreditsUsed,
        });
        await deps.db.query(
            'UPDATE users SET credits_available = 0, credits_used = credits_used + $2, updated_at = NOW() WHERE user_id = $1',
            [ctx.request.userId, currentBalance],
        );
        emitCreditWarning(deps, ctx);
        return { total_credits_deducted: currentBalance };
    }

    // Normal path: sufficient credits — finalize via credit tracker
    const result = await deps.creditTracker.finalizeSession(
        ctx.request.userId,
        ctx.sessionId,
    );

    emitCreditWarning(deps, ctx);

    return { total_credits_deducted: result.total_credits_deducted };
}

// -----------------------------------------------------------------------------
// Credit Warning Emission
// -----------------------------------------------------------------------------

function emitCreditWarning(
    deps: ResolvedExecutionDeps,
    ctx: PipelineContext,
): void {
    // Fire-and-forget: check balance and emit warning if low
    void (async () => {
        try {
            const balanceCheck = await deps.db.query<{ credits_available: number; plan_type: string }>(
                'SELECT credits_available, plan_type FROM users WHERE user_id = $1',
                [ctx.request.userId],
            );
            const row = balanceCheck.rows[0];
            if (row) {
                const total = PLAN_CREDITS[row.plan_type as PlanType];
                if (!total) {
                    throw new SDKExecutionError(`Unknown plan type: ${row.plan_type}`);
                }
                if (row.credits_available < total * 0.2) {
                    ctx.stream.send('credit_warning', {
                        credits_available: row.credits_available,
                        credits_total: total,
                        message: 'Credits running low — connect your own API key for unlimited usage',
                    });
                }
            }
        } catch (warnErr) {
            log.warn('Failed to emit credit warning', { error: warnErr instanceof Error ? warnErr.message : String(warnErr) });
        }
    })();
}
