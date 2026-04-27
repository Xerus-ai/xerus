// Billing Platform Tools
// Implements platform.get_billing_status (read-only)
// Source: users table billing columns

import { query } from '../../../../database/connection';
import type {
    GetBillingStatusInput,
    BillingStatusResult,
} from '../platform-tool.inlined-types';
import type { BillingServicePort } from '../platform-tool.types';

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export class BillingUserNotFoundError extends Error {
    constructor(userId: string) {
        super(`User not found for billing lookup: ${userId}`);
        this.name = 'BillingUserNotFoundError';
    }
}

// -----------------------------------------------------------------------------
// Row Types
// -----------------------------------------------------------------------------

interface BillingRow {
    plan_type: string;
    credits_available: number;
    credits_used: number;
    subscription_status: string | null;
    subscription_current_period_end: Date | null;
    billing_email: string | null;
}

// -----------------------------------------------------------------------------
// Billing Tool Service
// -----------------------------------------------------------------------------

export class BillingToolService implements BillingServicePort {
    async getBillingStatus(
        userId: string,
        _input: GetBillingStatusInput
    ): Promise<BillingStatusResult> {
        const result = await query<BillingRow>(
            `SELECT plan_type, credits_available, credits_used,
                    subscription_status, subscription_current_period_end,
                    billing_email
             FROM users
             WHERE user_id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            throw new BillingUserNotFoundError(userId);
        }

        const row = result.rows[0];

        return {
            plan_type: row.plan_type,
            credits_available: row.credits_available,
            credits_used: row.credits_used,
            subscription_status: row.subscription_status,
            subscription_current_period_end: row.subscription_current_period_end?.toISOString() ?? null,
            billing_email: row.billing_email,
        };
    }
}

// -----------------------------------------------------------------------------
// Singleton
// -----------------------------------------------------------------------------

let serviceInstance: BillingToolService | null = null;

export function getBillingToolService(): BillingToolService {
    if (!serviceInstance) {
        serviceInstance = new BillingToolService();
    }
    return serviceInstance;
}

export function resetBillingToolService(): void {
    serviceInstance = null;
}
