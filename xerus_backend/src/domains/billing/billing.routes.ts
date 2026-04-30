import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';
import { InvalidPlanError, NoBillingAccountError, NoActiveSubscriptionError } from './errors';
import { query } from '../../database/connection';
import { userRepository } from '../users/repository';
import { handlePolarWebhook } from './webhook.handler';
import { getClient, createCheckoutSession, getCustomerPortalUrl, cancelSubscription, updateSubscription } from './polar.client';
import type { PlanType } from '../users/types';
import { POLAR_PRODUCT_IDS, CREDIT_TOPUP_PRODUCTS, type BillingInterval } from './types';
import { checkoutSchema, creditCheckoutSchema, changePlanSchema } from './billing.validators';

const router = Router();
const auth = authenticateFirebaseToken;

// Derive reverse maps from the canonical product ID maps in types.ts
// PLAN_PRODUCT_MAP: "pro-monthly" -> UUID
const PLAN_PRODUCT_MAP: Record<string, string> = Object.fromEntries(
    Object.entries(POLAR_PRODUCT_IDS).map(([uuid, { plan, interval }]) => [`${plan}-${interval}`, uuid]),
);

// CREDIT_PRODUCT_MAP: "500" -> UUID
const CREDIT_PRODUCT_MAP: Record<string, string> = Object.fromEntries(
    Object.entries(CREDIT_TOPUP_PRODUCTS).map(([uuid, credits]) => [String(credits), uuid]),
);

router.post('/webhooks/polar', async (req, res, next) => {
    try {
        await handlePolarWebhook(req, res);
    } catch (err) {
        next(err);
    }
});

router.post('/checkout', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) throw new UnauthorizedError('Authentication required');

        const { error, value } = checkoutSchema.validate(req.body);
        if (error) throw new BadRequestError(error.details[0].message);

        const { plan, interval } = value as { plan: PlanType; interval: BillingInterval };
        const productKey = `${plan}-${interval}`;
        const productId = PLAN_PRODUCT_MAP[productKey];
        if (!productId) throw new InvalidPlanError(productKey);

        const user = await userRepository.findById(userId);

        const checkout = await createCheckoutSession({
            productId,
            customerEmail: user?.email ?? undefined,
            metadata: { user_id: userId },
        });

        sendResponse(res, 200, {
            checkout_url: checkout.url,
            checkout_id: checkout.id,
        }, startTime);
    } catch (err) {
        next(err);
    }
});

router.post('/checkout/credits', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) throw new UnauthorizedError('Authentication required');

        const { error, value } = creditCheckoutSchema.validate(req.body);
        if (error) throw new BadRequestError(error.details[0].message);

        const { credits } = value as { credits: number };
        const productId = CREDIT_PRODUCT_MAP[String(credits)];
        if (!productId) throw new InvalidPlanError(String(credits));

        const user = await userRepository.findById(userId);

        const checkout = await createCheckoutSession({
            productId,
            customerEmail: user?.email ?? undefined,
            metadata: { user_id: userId, credits: String(credits) },
        });

        sendResponse(res, 200, {
            checkout_url: checkout.url,
            checkout_id: checkout.id,
        }, startTime);
    } catch (err) {
        next(err);
    }
});

router.get('/portal', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) throw new UnauthorizedError('Authentication required');

        const user = await userRepository.findById(userId);
        if (!user?.polar_customer_id) {
            throw new NoBillingAccountError();
        }

        const portalUrl = await getCustomerPortalUrl(user.polar_customer_id);
        sendResponse(res, 200, { portal_url: portalUrl }, startTime);
    } catch (err) {
        next(err);
    }
});

router.get('/subscription', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) throw new UnauthorizedError('Authentication required');

        const user = await userRepository.findById(userId);
        if (!user) throw new BadRequestError('User not found');

        sendResponse(res, 200, {
            plan_type: user.plan_type,
            subscription_status: user.subscription_status,
            subscription_current_period_end: user.subscription_current_period_end,
            polar_customer_id: user.polar_customer_id,
            polar_subscription_id: user.polar_subscription_id,
            credits_available: user.credits_available,
            credits_used: user.credits_used,
            credits_reset_date: user.credits_reset_date,
        }, startTime);
    } catch (err) {
        next(err);
    }
});

router.post('/subscription/sync', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) throw new UnauthorizedError('Authentication required');

        const user = await userRepository.findById(userId);
        if (!user) throw new BadRequestError('User not found');

        const client = getClient();
        const email = user.email;

        const customers = await client.customers.list({ email, limit: 1 });
        const customer = customers.result.items[0];
        if (!customer) {
            if (user.polar_customer_id) {
                await query(
                    `UPDATE users SET polar_customer_id = NULL, polar_subscription_id = NULL,
                        subscription_status = 'revoked', updated_at = NOW()
                     WHERE user_id = $1`,
                    [userId],
                );
            }
            sendResponse(res, 200, { synced: true, subscription_status: user.polar_customer_id ? 'revoked' : user.subscription_status }, startTime);
            return;
        }

        // Check active subscriptions first, then any subscription (including canceled)
        let sub: { id: string; productId: string; status: string; currentPeriodEnd?: Date | null; cancelAtPeriodEnd?: boolean } | undefined;
        const activeSubs = await client.subscriptions.list({ customerId: customer.id, active: true, limit: 1 });
        sub = activeSubs.result.items[0];
        if (!sub) {
            const allSubs = await client.subscriptions.list({ customerId: customer.id, limit: 1 });
            sub = allSubs.result.items[0];
        }
        if (!sub) {
            if (user.polar_subscription_id) {
                await query(
                    `UPDATE users SET polar_subscription_id = NULL, subscription_status = 'revoked', updated_at = NOW()
                     WHERE user_id = $1`,
                    [userId],
                );
            }
            sendResponse(res, 200, { synced: true, subscription_status: user.polar_subscription_id ? 'revoked' : user.subscription_status }, startTime);
            return;
        }

        const polarStatus = sub.cancelAtPeriodEnd ? 'canceled'
            : sub.status === 'active' ? 'active'
            : sub.status === 'canceled' ? 'canceled'
            : sub.status === 'revoked' ? 'revoked'
            : user.subscription_status;

        const productMapping = POLAR_PRODUCT_IDS[sub.productId];
        const planType = productMapping?.plan ?? user.plan_type;

        await query(
            `UPDATE users SET
                polar_customer_id = $1,
                polar_subscription_id = $2,
                subscription_status = $3,
                plan_type = $4,
                billing_email = $5,
                subscription_current_period_end = $6,
                updated_at = NOW()
             WHERE user_id = $7`,
            [customer.id, sub.id, polarStatus, planType, email, sub.currentPeriodEnd ?? null, userId],
        );

        sendResponse(res, 200, {
            synced: true,
            subscription_status: polarStatus,
            plan_type: planType,
            polar_subscription_id: sub.id,
        }, startTime);
    } catch (err) {
        next(err);
    }
});

router.post('/subscription/cancel', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) throw new UnauthorizedError('Authentication required');

        const user = await userRepository.findById(userId);
        if (!user?.polar_subscription_id) {
            throw new NoActiveSubscriptionError();
        }

        await cancelSubscription(user.polar_subscription_id);

        await query(
            `UPDATE users SET subscription_status = 'canceled', updated_at = NOW()
             WHERE user_id = $1`,
            [userId],
        );

        sendResponse(res, 200, { status: 'canceled' }, startTime);
    } catch (err) {
        next(err);
    }
});

router.post('/subscription/change', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) throw new UnauthorizedError('Authentication required');

        const { error, value } = changePlanSchema.validate(req.body);
        if (error) throw new BadRequestError(error.details[0].message);

        const { plan, interval } = value as { plan: PlanType; interval: BillingInterval };
        const user = await userRepository.findById(userId);
        if (!user?.polar_subscription_id) {
            throw new NoActiveSubscriptionError();
        }
        if (user.subscription_status === 'canceled' || user.subscription_status === 'revoked') {
            throw new BadRequestError('Cannot change plan: subscription is no longer active. Please create a new subscription.');
        }

        const productKey = `${plan}-${interval}`;
        const productId = PLAN_PRODUCT_MAP[productKey];
        if (!productId) throw new InvalidPlanError(productKey);

        await updateSubscription(user.polar_subscription_id, productId);

        sendResponse(res, 200, { status: 'changed', new_plan: plan }, startTime);
    } catch (err) {
        next(err);
    }
});

router.get('/usage', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) throw new UnauthorizedError('Authentication required');

        const workspaceResult = await query<{ id: string }>(
            'SELECT id::text FROM workspaces WHERE user_id = $1 LIMIT 1',
            [userId],
        );
        const workspaceId = workspaceResult.rows[0]?.id;

        const [byAgent, byDay] = await Promise.all([
            query<{ agent_slug: string; total_credits: string }>(
                `SELECT agent_slug, COALESCE(SUM(credits_used), 0)::text AS total_credits
                 FROM execution_sessions
                 WHERE workspace_id = $1
                   AND started_at >= NOW() - INTERVAL '30 days'
                   AND agent_slug IS NOT NULL
                 GROUP BY agent_slug
                 ORDER BY SUM(credits_used) DESC
                 LIMIT 10`,
                [workspaceId],
            ),
            query<{ date: string; total_credits: string }>(
                `SELECT DATE(started_at)::text AS date, COALESCE(SUM(credits_used), 0)::text AS total_credits
                 FROM execution_sessions
                 WHERE workspace_id = $1
                   AND started_at >= NOW() - INTERVAL '30 days'
                 GROUP BY DATE(started_at)
                 ORDER BY DATE(started_at)`,
                [workspaceId],
            ),
        ]);

        sendResponse(res, 200, {
            by_agent: byAgent.rows.map(r => ({
                agent_slug: r.agent_slug,
                credits: parseFloat(r.total_credits),
            })),
            by_day: byDay.rows.map(r => ({
                date: r.date,
                credits: parseFloat(r.total_credits),
            })),
        }, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
