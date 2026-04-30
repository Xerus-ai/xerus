// Subscription Guard — validates subscription status and reserves credits before execution.
// Extracted from execution-pipeline.ts to keep the pipeline under 400 lines.

import { SDKExecutionError } from './errors';
import type { ResolvedExecutionDeps, PipelineContext } from './execution-pipeline.types';
import type { SubscriptionStatus } from '../users/types';

// -----------------------------------------------------------------------------
// Credit Reservation
// -----------------------------------------------------------------------------

export async function reserveCredits(
    deps: ResolvedExecutionDeps,
    ctx: PipelineContext,
): Promise<void> {
    // Check subscription status (loaded during loadAgent — no extra SELECT needed)
    const status: SubscriptionStatus | null = ctx.subscriptionStatus;
    const periodEnd = ctx.subscriptionPeriodEnd;
    const now = new Date();

    if (status === 'revoked') {
        throw new SDKExecutionError('Subscription revoked — update your payment method');
    }
    if (status === 'canceled' && periodEnd && periodEnd < now) {
        throw new SDKExecutionError('Subscription expired — renew to continue');
    }
    if (status === 'past_due') {
        throw new SDKExecutionError('Payment past due — update your payment method');
    }

    // BYOK users use their own API key — skip credit reservation
    if (ctx.keySource === 'byok') {
        return;
    }

    const estimatedTokens = estimateExecutionTokens(ctx.request.task);
    const estimate = deps.sdkService.estimateCreditsConservative(estimatedTokens);

    const hasCredits = await deps.creditTracker.checkCredits(
        ctx.request.userId,
        estimate.estimatedCredits,
    );

    if (!hasCredits) {
        throw new SDKExecutionError('Insufficient credits for execution');
    }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

export function estimateExecutionTokens(task: string): number {
    // Conservative: always assume opus-level usage for pre-reservation.
    // Real usage is tracked by the runner and reconciled in finalizeCredits.
    const baseTokens = 10000;
    const taskTokens = Math.ceil(task.length / 4);
    return baseTokens + taskTokens;
}
