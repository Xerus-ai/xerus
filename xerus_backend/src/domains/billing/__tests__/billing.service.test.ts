// Billing Service Integration Tests
// Tests webhook event processing with real NeonDB PostgreSQL database
// NO mocks — verifies actual DB state after each operation

import { query } from '../../../database/connection';
import { billingService } from '../billing.service';
import { POLAR_PRODUCT_IDS, CREDIT_TOPUP_PRODUCTS } from '../types';
import { PLAN_CREDITS, type PlanType } from '../../users/types';

// ---------------------------------------------------------------------------
// Test Constants
// ---------------------------------------------------------------------------

const TEST_PREFIX = 'test_billing_';
const TEST_CUSTOMER_ID = `${TEST_PREFIX}cust_${Date.now()}`;

// Extract actual product IDs from the config for each plan
const PRO_MONTHLY_PRODUCT_ID = Object.keys(POLAR_PRODUCT_IDS).find(
    (id) => POLAR_PRODUCT_IDS[id].plan === 'pro' && POLAR_PRODUCT_IDS[id].interval === 'monthly',
)!;
const MAX_MONTHLY_PRODUCT_ID = Object.keys(POLAR_PRODUCT_IDS).find(
    (id) => POLAR_PRODUCT_IDS[id].plan === 'max' && POLAR_PRODUCT_IDS[id].interval === 'monthly',
)!;
const ULTRA_MONTHLY_PRODUCT_ID = Object.keys(POLAR_PRODUCT_IDS).find(
    (id) => POLAR_PRODUCT_IDS[id].plan === 'ultra' && POLAR_PRODUCT_IDS[id].interval === 'monthly',
)!;
const TOPUP_500_PRODUCT_ID = Object.keys(CREDIT_TOPUP_PRODUCTS).find(
    (id) => CREDIT_TOPUP_PRODUCTS[id] === 500,
)!;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestUser(
    userId: string,
    planType: PlanType = 'pro',
    credits = 500,
): Promise<void> {
    const email = `${userId}_${Math.random().toString(36).substring(7)}@test.local`;
    await query(
        `INSERT INTO users (user_id, email, display_name, plan_type, credits_available, credits_used, subscription_status, credits_reset_date)
         VALUES ($1, $2, $3, $4, $5, 0, 'pending', NOW() + INTERVAL '30 days')
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, email, 'Test Billing User', planType, credits],
    );
}

async function getUser(userId: string): Promise<{
    plan_type: string;
    credits_available: number;
    credits_used: number;
    subscription_status: string;
    polar_customer_id: string | null;
    polar_subscription_id: string | null;
    subscription_current_period_end: Date | null;
    billing_email: string | null;
}> {
    const result = await query<{
        plan_type: string;
        credits_available: number;
        credits_used: number;
        subscription_status: string;
        polar_customer_id: string | null;
        polar_subscription_id: string | null;
        subscription_current_period_end: Date | null;
        billing_email: string | null;
    }>(
        `SELECT plan_type, credits_available, credits_used, subscription_status,
                polar_customer_id, polar_subscription_id, subscription_current_period_end, billing_email
         FROM users WHERE user_id = $1`,
        [userId],
    );
    if (result.rows.length === 0) {
        throw new Error(`Test user ${userId} not found`);
    }
    return result.rows[0];
}

async function webhookEventExists(eventId: string): Promise<boolean> {
    const result = await query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM polar_webhook_events WHERE event_id = $1',
        [eventId],
    );
    return (result.rows[0]?.count ?? 0) > 0;
}

function makeEventId(suffix: string): string {
    return `${TEST_PREFIX}evt_${Date.now()}_${suffix}`;
}

// ---------------------------------------------------------------------------
// Ensure polar_webhook_events table exists (migration 088)
// ---------------------------------------------------------------------------

async function ensureWebhookEventsTable(): Promise<void> {
    await query(`
        CREATE TABLE IF NOT EXISTS polar_webhook_events (
            id SERIAL PRIMARY KEY,
            event_id VARCHAR(255) NOT NULL UNIQUE,
            event_type VARCHAR(100) NOT NULL,
            polar_customer_id VARCHAR(255),
            polar_subscription_id VARCHAR(255),
            payload JSONB NOT NULL,
            processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    `);
}

async function ensureCreditTransactionsTable(): Promise<void> {
    await query(`
        CREATE TABLE IF NOT EXISTS credit_transactions (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL,
            amount INTEGER NOT NULL,
            operation_type VARCHAR(50) NOT NULL,
            reason TEXT,
            session_id VARCHAR(255),
            balance_after INTEGER NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    `);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
    await ensureWebhookEventsTable();
    await ensureCreditTransactionsTable();
});

beforeEach(async () => {
    await query("DELETE FROM credit_transactions WHERE user_id LIKE $1", [`${TEST_PREFIX}%`]);
    await query("DELETE FROM polar_webhook_events WHERE event_id LIKE $1", [`${TEST_PREFIX}%`]);
    await query("DELETE FROM users WHERE user_id LIKE $1", [`${TEST_PREFIX}%`]);
});

afterAll(async () => {
    // Best-effort cleanup: the global setup.ts afterAll may close the pool
    // before this runs, so we tolerate connection errors here.
    try {
        await query("DELETE FROM credit_transactions WHERE user_id LIKE $1", [`${TEST_PREFIX}%`]);
        await query("DELETE FROM polar_webhook_events WHERE event_id LIKE $1", [`${TEST_PREFIX}%`]);
        await query("DELETE FROM users WHERE user_id LIKE $1", [`${TEST_PREFIX}%`]);
    } catch (err) {
        // Pool may already be closed by global teardown
        if (!(err instanceof Error && err.message.includes('pool'))) {
            console.error('Unexpected cleanup error:', err);
        }
    }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BillingService', () => {
    describe('webhook idempotency', () => {
        it('processes an event only once and skips duplicates', async () => {
            const userId = `${TEST_PREFIX}idemp_${Date.now()}`;
            await createTestUser(userId, 'pro', 100);

            const eventId = makeEventId('idemp');
            const payload = {
                type: 'checkout.completed',
                data: {
                    product_id: PRO_MONTHLY_PRODUCT_ID,
                    customer_id: TEST_CUSTOMER_ID,
                    customer_email: 'idemp@test.local',
                    metadata: { user_id: userId },
                },
            };

            // First call: should process normally
            await billingService.processWebhookEvent(eventId, 'checkout.completed', payload);

            const userAfterFirst = await getUser(userId);
            const creditsAfterFirst = userAfterFirst.credits_available;
            expect(creditsAfterFirst).toBe(100 + PLAN_CREDITS.pro);
            expect(userAfterFirst.subscription_status).toBe('active');

            // Second call: duplicate, should be a no-op
            await billingService.processWebhookEvent(eventId, 'checkout.completed', payload);

            const userAfterSecond = await getUser(userId);
            expect(userAfterSecond.credits_available).toBe(creditsAfterFirst);
            expect(userAfterSecond.subscription_status).toBe('active');

            // Verify only one webhook event row exists
            const eventCount = await query<{ count: number }>(
                'SELECT COUNT(*)::int AS count FROM polar_webhook_events WHERE event_id = $1',
                [eventId],
            );
            expect(eventCount.rows[0].count).toBe(1);
        });
    });

    describe('checkout.completed - subscription plan', () => {
        it('activates subscription and grants plan credits for pro plan', async () => {
            const userId = `${TEST_PREFIX}checkout_pro_${Date.now()}`;
            await createTestUser(userId, 'pro', 0);

            const eventId = makeEventId('checkout_pro');
            const payload = {
                type: 'checkout.completed',
                data: {
                    product_id: PRO_MONTHLY_PRODUCT_ID,
                    customer_id: `${TEST_PREFIX}cust_pro`,
                    customer_email: 'pro@test.local',
                    metadata: { user_id: userId },
                },
            };

            await billingService.processWebhookEvent(eventId, 'checkout.completed', payload);

            const user = await getUser(userId);
            expect(user.plan_type).toBe('pro');
            expect(user.subscription_status).toBe('active');
            expect(user.credits_available).toBe(PLAN_CREDITS.pro);
            expect(user.polar_customer_id).toBe(`${TEST_PREFIX}cust_pro`);
            expect(user.billing_email).toBe('pro@test.local');
            expect(await webhookEventExists(eventId)).toBe(true);
        });

        it('activates subscription and grants plan credits for max plan', async () => {
            const userId = `${TEST_PREFIX}checkout_max_${Date.now()}`;
            await createTestUser(userId, 'pro', 0);

            const eventId = makeEventId('checkout_max');
            const payload = {
                type: 'checkout.completed',
                data: {
                    product_id: MAX_MONTHLY_PRODUCT_ID,
                    customer_id: `${TEST_PREFIX}cust_max`,
                    customer_email: 'max@test.local',
                    metadata: { user_id: userId },
                },
            };

            await billingService.processWebhookEvent(eventId, 'checkout.completed', payload);

            const user = await getUser(userId);
            expect(user.plan_type).toBe('max');
            expect(user.subscription_status).toBe('active');
            expect(user.credits_available).toBe(PLAN_CREDITS.max);
        });

        it('activates subscription and grants plan credits for ultra plan', async () => {
            const userId = `${TEST_PREFIX}checkout_ultra_${Date.now()}`;
            await createTestUser(userId, 'pro', 0);

            const eventId = makeEventId('checkout_ultra');
            const payload = {
                type: 'checkout.completed',
                data: {
                    product_id: ULTRA_MONTHLY_PRODUCT_ID,
                    customer_id: `${TEST_PREFIX}cust_ultra`,
                    customer_email: 'ultra@test.local',
                    metadata: { user_id: userId },
                },
            };

            await billingService.processWebhookEvent(eventId, 'checkout.completed', payload);

            const user = await getUser(userId);
            expect(user.plan_type).toBe('ultra');
            expect(user.subscription_status).toBe('active');
            expect(user.credits_available).toBe(PLAN_CREDITS.ultra);
        });

        it('throws when user_id is missing from checkout metadata', async () => {
            const eventId = makeEventId('checkout_no_user');
            const payload = {
                type: 'checkout.completed',
                data: {
                    product_id: PRO_MONTHLY_PRODUCT_ID,
                    customer_id: TEST_CUSTOMER_ID,
                    metadata: {},
                },
            };

            await expect(
                billingService.processWebhookEvent(eventId, 'checkout.completed', payload),
            ).rejects.toThrow('checkout.completed payload missing user_id in metadata');
        });
    });

    describe('checkout.completed - credit top-up', () => {
        it('adds topup credits without changing plan_type', async () => {
            const userId = `${TEST_PREFIX}topup_${Date.now()}`;
            await createTestUser(userId, 'max', 200);

            const eventId = makeEventId('topup');
            const topupAmount = CREDIT_TOPUP_PRODUCTS[TOPUP_500_PRODUCT_ID];
            const payload = {
                type: 'checkout.completed',
                data: {
                    product_id: TOPUP_500_PRODUCT_ID,
                    customer_id: TEST_CUSTOMER_ID,
                    customer_email: 'topup@test.local',
                    metadata: { user_id: userId },
                },
            };

            await billingService.processWebhookEvent(eventId, 'checkout.completed', payload);

            const user = await getUser(userId);
            expect(user.credits_available).toBe(200 + topupAmount);
            expect(user.plan_type).toBe('max');
            expect(user.subscription_status).toBe('pending');
        });
    });

    describe('subscription.created', () => {
        it('stores subscription_id and sets status to active', async () => {
            const userId = `${TEST_PREFIX}subcreated_${Date.now()}`;
            await createTestUser(userId, 'pro', 500);

            const subscriptionId = `${TEST_PREFIX}sub_created_${Date.now()}`;
            const customerId = `${TEST_PREFIX}cust_created_${Date.now()}`;
            const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

            const eventId = makeEventId('sub_created');
            const payload = {
                type: 'subscription.created',
                data: {
                    id: subscriptionId,
                    customer_id: customerId,
                    product_id: PRO_MONTHLY_PRODUCT_ID,
                    current_period_end: periodEnd,
                    metadata: { user_id: userId },
                },
            };

            await billingService.processWebhookEvent(eventId, 'subscription.created', payload);

            const user = await getUser(userId);
            expect(user.polar_subscription_id).toBe(subscriptionId);
            expect(user.polar_customer_id).toBe(customerId);
            expect(user.subscription_status).toBe('active');
            expect(user.plan_type).toBe('pro');
            expect(user.subscription_current_period_end).not.toBeNull();
            expect(await webhookEventExists(eventId)).toBe(true);
        });

        it('throws when user_id is missing from subscription.created metadata', async () => {
            const eventId = makeEventId('sub_created_no_user');
            const payload = {
                type: 'subscription.created',
                data: {
                    id: `${TEST_PREFIX}sub_no_user`,
                    customer_id: TEST_CUSTOMER_ID,
                    product_id: PRO_MONTHLY_PRODUCT_ID,
                    metadata: {},
                },
            };

            await expect(
                billingService.processWebhookEvent(eventId, 'subscription.created', payload),
            ).rejects.toThrow('subscription.created payload missing user_id in metadata');
        });

        it('throws when subscription id is missing', async () => {
            const userId = `${TEST_PREFIX}subcreated_noid_${Date.now()}`;
            await createTestUser(userId, 'pro', 500);

            const eventId = makeEventId('sub_created_noid');
            const payload = {
                type: 'subscription.created',
                data: {
                    customer_id: TEST_CUSTOMER_ID,
                    product_id: PRO_MONTHLY_PRODUCT_ID,
                    metadata: { user_id: userId },
                },
            };

            await expect(
                billingService.processWebhookEvent(eventId, 'subscription.created', payload),
            ).rejects.toThrow('subscription.created payload missing subscription id');
        });
    });

    describe('subscription.updated - plan upgrade', () => {
        it('upgrades plan and grants bonus credits (difference between plans)', async () => {
            const userId = `${TEST_PREFIX}upgrade_${Date.now()}`;
            const subscriptionId = `${TEST_PREFIX}sub_upgrade_${Date.now()}`;
            await createTestUser(userId, 'pro', 300);

            // Set up subscription ID on user so findByPolarSubscriptionId works
            await query(
                `UPDATE users SET polar_subscription_id = $1, subscription_status = 'active' WHERE user_id = $2`,
                [subscriptionId, userId],
            );

            const eventId = makeEventId('upgrade');
            const payload = {
                type: 'subscription.updated',
                data: {
                    id: subscriptionId,
                    product_id: MAX_MONTHLY_PRODUCT_ID,
                    status: 'active',
                    current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                },
            };

            await billingService.processWebhookEvent(eventId, 'subscription.updated', payload);

            const user = await getUser(userId);
            expect(user.plan_type).toBe('max');
            expect(user.subscription_status).toBe('active');

            // Bonus = PLAN_CREDITS.max - PLAN_CREDITS.pro
            const expectedBonus = PLAN_CREDITS.max - PLAN_CREDITS.pro;
            expect(user.credits_available).toBe(300 + expectedBonus);
        });

        it('upgrades from pro to ultra and grants correct bonus', async () => {
            const userId = `${TEST_PREFIX}upgrade_ultra_${Date.now()}`;
            const subscriptionId = `${TEST_PREFIX}sub_upgrade_ultra_${Date.now()}`;
            await createTestUser(userId, 'pro', 100);

            await query(
                `UPDATE users SET polar_subscription_id = $1, subscription_status = 'active' WHERE user_id = $2`,
                [subscriptionId, userId],
            );

            const eventId = makeEventId('upgrade_ultra');
            const payload = {
                type: 'subscription.updated',
                data: {
                    id: subscriptionId,
                    product_id: ULTRA_MONTHLY_PRODUCT_ID,
                    status: 'active',
                },
            };

            await billingService.processWebhookEvent(eventId, 'subscription.updated', payload);

            const user = await getUser(userId);
            expect(user.plan_type).toBe('ultra');
            const expectedBonus = PLAN_CREDITS.ultra - PLAN_CREDITS.pro;
            expect(user.credits_available).toBe(100 + expectedBonus);
        });

        it('does not grant bonus credits on downgrade (higher to lower plan)', async () => {
            const userId = `${TEST_PREFIX}downgrade_${Date.now()}`;
            const subscriptionId = `${TEST_PREFIX}sub_downgrade_${Date.now()}`;
            await createTestUser(userId, 'ultra', 5000);

            await query(
                `UPDATE users SET polar_subscription_id = $1, subscription_status = 'active' WHERE user_id = $2`,
                [subscriptionId, userId],
            );

            const eventId = makeEventId('downgrade');
            const payload = {
                type: 'subscription.updated',
                data: {
                    id: subscriptionId,
                    product_id: PRO_MONTHLY_PRODUCT_ID,
                    status: 'active',
                },
            };

            await billingService.processWebhookEvent(eventId, 'subscription.updated', payload);

            const user = await getUser(userId);
            expect(user.plan_type).toBe('pro');
            // No bonus credits granted on downgrade
            expect(user.credits_available).toBe(5000);
        });

        it('skips silently when subscription id is not found', async () => {
            const eventId = makeEventId('update_unknown');
            const payload = {
                type: 'subscription.updated',
                data: {
                    id: `${TEST_PREFIX}nonexistent_sub_${Date.now()}`,
                    product_id: MAX_MONTHLY_PRODUCT_ID,
                    status: 'active',
                },
            };

            // Should not throw
            await billingService.processWebhookEvent(eventId, 'subscription.updated', payload);
            expect(await webhookEventExists(eventId)).toBe(true);
        });
    });

    describe('subscription.canceled', () => {
        it('sets subscription_status to canceled and stores period end', async () => {
            const userId = `${TEST_PREFIX}canceled_${Date.now()}`;
            const subscriptionId = `${TEST_PREFIX}sub_canceled_${Date.now()}`;
            await createTestUser(userId, 'max', 1000);

            await query(
                `UPDATE users SET polar_subscription_id = $1, subscription_status = 'active' WHERE user_id = $2`,
                [subscriptionId, userId],
            );

            const periodEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
            const eventId = makeEventId('canceled');
            const payload = {
                type: 'subscription.canceled',
                data: {
                    id: subscriptionId,
                    current_period_end: periodEnd,
                },
            };

            await billingService.processWebhookEvent(eventId, 'subscription.canceled', payload);

            const user = await getUser(userId);
            expect(user.subscription_status).toBe('canceled');
            expect(user.subscription_current_period_end).not.toBeNull();
            // Credits remain untouched on cancellation
            expect(user.credits_available).toBe(1000);
            expect(user.plan_type).toBe('max');
        });

        it('skips silently when subscription id is not found', async () => {
            const eventId = makeEventId('canceled_unknown');
            const payload = {
                type: 'subscription.canceled',
                data: {
                    id: `${TEST_PREFIX}nonexistent_cancel_${Date.now()}`,
                    current_period_end: new Date().toISOString(),
                },
            };

            await billingService.processWebhookEvent(eventId, 'subscription.canceled', payload);
            expect(await webhookEventExists(eventId)).toBe(true);
        });

        it('throws when subscription id is missing from payload', async () => {
            const eventId = makeEventId('canceled_noid');
            const payload = {
                type: 'subscription.canceled',
                data: {
                    current_period_end: new Date().toISOString(),
                },
            };

            await expect(
                billingService.processWebhookEvent(eventId, 'subscription.canceled', payload),
            ).rejects.toThrow('subscription.canceled payload missing subscription id');
        });
    });

    describe('subscription.revoked', () => {
        it('sets subscription_status to revoked', async () => {
            const userId = `${TEST_PREFIX}revoked_${Date.now()}`;
            const subscriptionId = `${TEST_PREFIX}sub_revoked_${Date.now()}`;
            await createTestUser(userId, 'pro', 500);

            await query(
                `UPDATE users SET polar_subscription_id = $1, subscription_status = 'active' WHERE user_id = $2`,
                [subscriptionId, userId],
            );

            const eventId = makeEventId('revoked');
            const payload = {
                type: 'subscription.revoked',
                data: {
                    id: subscriptionId,
                },
            };

            await billingService.processWebhookEvent(eventId, 'subscription.revoked', payload);

            const user = await getUser(userId);
            expect(user.subscription_status).toBe('revoked');
            // Credits and plan remain as-is on revoke
            expect(user.credits_available).toBe(500);
            expect(user.plan_type).toBe('pro');
        });

        it('skips silently when subscription id is not found', async () => {
            const eventId = makeEventId('revoked_unknown');
            const payload = {
                type: 'subscription.revoked',
                data: {
                    id: `${TEST_PREFIX}nonexistent_revoke_${Date.now()}`,
                },
            };

            await billingService.processWebhookEvent(eventId, 'subscription.revoked', payload);
            expect(await webhookEventExists(eventId)).toBe(true);
        });

        it('throws when subscription id is missing from payload', async () => {
            const eventId = makeEventId('revoked_noid');
            const payload = {
                type: 'subscription.revoked',
                data: {},
            };

            await expect(
                billingService.processWebhookEvent(eventId, 'subscription.revoked', payload),
            ).rejects.toThrow('subscription.revoked payload missing subscription id');
        });
    });
});
