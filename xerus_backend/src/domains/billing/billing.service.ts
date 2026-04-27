import { logger } from '../../utils/logger';
import { transaction } from '../../database/connection';
import { userRepository } from '../users/repository';
import { creditService } from '../users/credit-service';
import { PLAN_CREDITS, type SubscriptionStatus } from '../users/types';
import { webhookRepository } from './webhook.repository';
import { POLAR_PRODUCT_IDS, CREDIT_TOPUP_PRODUCTS, type PolarWebhookEventType } from './types';

const log = logger('BillingService');

const POLAR_STATUS_MAP: Record<string, SubscriptionStatus> = {
    active: 'active',
    past_due: 'past_due',
    canceled: 'canceled',
    revoked: 'revoked',
};

export class BillingService {
    async processWebhookEvent(
        eventId: string,
        eventType: PolarWebhookEventType,
        payload: Record<string, unknown>,
    ): Promise<void> {
        await transaction(async (client) => {
            const inserted = await webhookRepository.insertIfNotExists(client, {
                event_id: eventId,
                event_type: eventType,
                polar_customer_id: this.extractCustomerId(payload),
                polar_subscription_id: this.extractSubscriptionId(payload),
                payload,
            });

            if (!inserted) {
                log.info('Duplicate webhook event, skipping', { event_id: eventId });
                return;
            }

            switch (eventType) {
                case 'checkout.completed':
                    await this.handleCheckoutCompleted(payload);
                    break;
                case 'subscription.created':
                    await this.handleSubscriptionCreated(payload);
                    break;
                case 'subscription.updated':
                    await this.handleSubscriptionUpdated(payload);
                    break;
                case 'subscription.canceled':
                    await this.handleSubscriptionCanceled(payload);
                    break;
                case 'subscription.revoked':
                    await this.handleSubscriptionRevoked(payload);
                    break;
                default:
                    log.warn('Unhandled webhook event type', { event_type: eventType });
            }
        });
    }

    private async handleCheckoutCompleted(payload: Record<string, unknown>): Promise<void> {
        const data = payload.data as Record<string, unknown> | undefined;
        if (!data) {
            throw new Error('Missing data field in checkout.completed webhook payload');
        }

        const productId = data.product_id as string | undefined;
        const customerId = data.customer_id as string | undefined;
        const customerEmail = data.customer_email as string | undefined;
        const metadata = data.metadata as Record<string, string> | undefined;
        const userId = metadata?.user_id;

        if (!userId) {
            throw new Error('checkout.completed payload missing user_id in metadata');
        }

        const topupCredits = productId ? CREDIT_TOPUP_PRODUCTS[productId] : undefined;
        if (topupCredits) {
            await creditService.grantCredits(userId, topupCredits, `Credit top-up: ${topupCredits} credits`);
            log.info('Credit top-up processed', { user_id: userId, credits: topupCredits });
            return;
        }

        const productMapping = productId ? POLAR_PRODUCT_IDS[productId] : undefined;
        if (productMapping) {
            const planCredits = PLAN_CREDITS[productMapping.plan];
            await userRepository.updateSubscription(userId, {
                polar_customer_id: customerId,
                subscription_status: 'active',
                plan_type: productMapping.plan,
                billing_email: customerEmail,
            });
            await creditService.grantCredits(userId, planCredits, `Subscription activated: ${productMapping.plan} plan`);
            log.info('Subscription checkout completed', { user_id: userId, plan: productMapping.plan });
        }
    }

    private async handleSubscriptionCreated(payload: Record<string, unknown>): Promise<void> {
        const data = payload.data as Record<string, unknown> | undefined;
        if (!data) {
            throw new Error('Missing data field in subscription.created webhook payload');
        }

        const subscriptionId = data.id as string | undefined;
        const customerId = data.customer_id as string | undefined;
        const productId = data.product_id as string | undefined;
        const currentPeriodEnd = data.current_period_end as string | undefined;
        const metadata = data.metadata as Record<string, string> | undefined;
        const userId = metadata?.user_id;

        if (!userId) {
            throw new Error('subscription.created payload missing user_id in metadata');
        }
        if (!subscriptionId) {
            throw new Error('subscription.created payload missing subscription id');
        }

        const productMapping = productId ? POLAR_PRODUCT_IDS[productId] : undefined;

        await userRepository.updateSubscription(userId, {
            polar_customer_id: customerId,
            polar_subscription_id: subscriptionId,
            subscription_status: 'active',
            subscription_current_period_end: currentPeriodEnd ? new Date(currentPeriodEnd) : null,
            plan_type: productMapping?.plan,
        });

        log.info('Subscription created', { user_id: userId, subscription_id: subscriptionId });
    }

    private async handleSubscriptionUpdated(payload: Record<string, unknown>): Promise<void> {
        const data = payload.data as Record<string, unknown> | undefined;
        if (!data) {
            throw new Error('Missing data field in subscription.updated webhook payload');
        }

        const subscriptionId = data.id as string | undefined;
        const productId = data.product_id as string | undefined;
        const currentPeriodEnd = data.current_period_end as string | undefined;
        const status = data.status as string | undefined;

        if (!subscriptionId) {
            throw new Error('subscription.updated payload missing subscription id');
        }

        const user = await userRepository.findByPolarSubscriptionId(subscriptionId);
        if (!user) {
            log.warn('Subscription updated for unknown subscription', { subscription_id: subscriptionId });
            return;
        }

        const productMapping = productId ? POLAR_PRODUCT_IDS[productId] : undefined;
        const oldPlan = user.plan_type;
        const newPlan = productMapping?.plan;

        const mappedStatus = POLAR_STATUS_MAP[status ?? ''] ?? user.subscription_status;

        await userRepository.updateSubscription(user.user_id, {
            subscription_status: mappedStatus,
            subscription_current_period_end: currentPeriodEnd ? new Date(currentPeriodEnd) : undefined,
            plan_type: newPlan,
        });

        if (newPlan && newPlan !== oldPlan) {
            const newCredits = PLAN_CREDITS[newPlan];
            const oldCredits = PLAN_CREDITS[oldPlan];
            if (newCredits > oldCredits) {
                const bonus = newCredits - oldCredits;
                await creditService.grantCredits(user.user_id, bonus, `Plan upgrade: ${oldPlan} → ${newPlan}`);
            }
            log.info('Plan changed', { user_id: user.user_id, from: oldPlan, to: newPlan });
        }
    }

    private async handleSubscriptionCanceled(payload: Record<string, unknown>): Promise<void> {
        const data = payload.data as Record<string, unknown> | undefined;
        if (!data) {
            throw new Error('Missing data field in subscription.canceled webhook payload');
        }

        const subscriptionId = data.id as string | undefined;
        const currentPeriodEnd = data.current_period_end as string | undefined;

        if (!subscriptionId) {
            throw new Error('subscription.canceled payload missing subscription id');
        }

        const user = await userRepository.findByPolarSubscriptionId(subscriptionId);
        if (!user) {
            log.warn('Subscription canceled for unknown subscription', { subscription_id: subscriptionId });
            return;
        }

        await userRepository.updateSubscription(user.user_id, {
            subscription_status: 'canceled',
            subscription_current_period_end: currentPeriodEnd ? new Date(currentPeriodEnd) : undefined,
        });

        log.info('Subscription canceled', { user_id: user.user_id, period_end: currentPeriodEnd });
    }

    private async handleSubscriptionRevoked(payload: Record<string, unknown>): Promise<void> {
        const data = payload.data as Record<string, unknown> | undefined;
        if (!data) {
            throw new Error('Missing data field in subscription.revoked webhook payload');
        }

        const subscriptionId = data.id as string | undefined;
        if (!subscriptionId) {
            throw new Error('subscription.revoked payload missing subscription id');
        }

        const user = await userRepository.findByPolarSubscriptionId(subscriptionId);
        if (!user) {
            log.warn('Subscription revoked for unknown subscription', { subscription_id: subscriptionId });
            return;
        }

        await userRepository.updateSubscription(user.user_id, {
            subscription_status: 'revoked',
        });

        log.info('Subscription revoked — immediate block', { user_id: user.user_id });
    }

    private extractCustomerId(payload: Record<string, unknown>): string | null {
        const data = payload.data as Record<string, unknown> | undefined;
        return (data?.customer_id as string) ?? null;
    }

    private extractSubscriptionId(payload: Record<string, unknown>): string | null {
        const data = payload.data as Record<string, unknown> | undefined;
        return (data?.id as string) ?? (data?.subscription_id as string) ?? null;
    }
}

export const billingService = new BillingService();
