import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';
import { transaction } from '../../database/connection';
import { subscriptionRepository } from '../users/subscription.repository';
import { creditService } from '../users/credit-service';
import { PLAN_CREDITS, type SubscriptionStatus } from '../users/types';
import { webhookRepository } from './webhook.repository';
import { WebhookProcessingError } from './errors';
import { POLAR_PRODUCT_IDS, CREDIT_TOPUP_PRODUCTS, type PolarWebhookEventType } from './types';

const log = logger('BillingService');

// ===== TYPED WEBHOOK PAYLOAD INTERFACES =====

interface PolarCheckoutData {
    product_id?: string;
    customer_id?: string;
    customer_email?: string;
    subscription_id?: string;
    metadata?: { user_id?: string; [key: string]: string | undefined };
}

interface PolarSubscriptionData {
    id?: string;
    customer_id?: string;
    product_id?: string;
    current_period_end?: string;
    status?: string;
    metadata?: { user_id?: string; [key: string]: string | undefined };
}

function extractData<T>(payload: Record<string, unknown>, eventType: string): T {
    const data = payload.data;
    if (!data || typeof data !== 'object') {
        throw new WebhookProcessingError(`Missing data field in ${eventType} webhook payload`);
    }
    return data as T;
}

// ===== STATUS MAP =====

const POLAR_STATUS_MAP: Record<string, SubscriptionStatus> = {
    active: 'active',
    past_due: 'past_due',
    canceled: 'canceled',
    revoked: 'revoked',
};

// ===== LOOKUP HELPERS =====

async function findUserBySubscriptionOrCustomer(
    client: PoolClient,
    subscriptionId: string,
    customerId: string | undefined,
    eventType: string,
) {
    const user = await subscriptionRepository.findByPolarSubscriptionId(subscriptionId, client);
    if (user) return user;

    if (customerId) {
        const userByCustomer = await subscriptionRepository.findByPolarCustomerId(customerId, client);
        if (userByCustomer) {
            log.info('Fell back to customer_id lookup', {
                event_type: eventType,
                subscription_id: subscriptionId,
                customer_id: customerId,
                user_id: userByCustomer.user_id,
            });
            return userByCustomer;
        }
    }

    log.warn(`${eventType} for unknown subscription and customer`, {
        subscription_id: subscriptionId,
        customer_id: customerId,
    });
    return null;
}

// ===== SERVICE =====

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
                    await this.handleCheckoutCompleted(client, payload);
                    break;
                case 'subscription.created':
                    await this.handleSubscriptionCreated(client, payload);
                    break;
                case 'subscription.updated':
                    await this.handleSubscriptionUpdated(client, payload);
                    break;
                case 'subscription.canceled':
                    await this.handleSubscriptionCanceled(client, payload);
                    break;
                case 'subscription.revoked':
                    await this.handleSubscriptionRevoked(client, payload);
                    break;
                default:
                    log.warn('Unhandled webhook event type', { event_type: eventType });
            }
        });
    }

    private async handleCheckoutCompleted(client: PoolClient, payload: Record<string, unknown>): Promise<void> {
        const data = extractData<PolarCheckoutData>(payload, 'checkout.completed');

        const userId = data.metadata?.user_id;
        if (!userId) {
            throw new WebhookProcessingError('checkout.completed payload missing user_id in metadata');
        }

        const topupCredits = data.product_id ? CREDIT_TOPUP_PRODUCTS[data.product_id] : undefined;
        if (topupCredits) {
            await creditService.grantCreditsWithClient(client, userId, topupCredits, `Credit top-up: ${topupCredits} credits`);
            log.info('Credit top-up processed', { user_id: userId, credits: topupCredits });
            return;
        }

        const productMapping = data.product_id ? POLAR_PRODUCT_IDS[data.product_id] : undefined;
        if (productMapping) {
            const planCredits = PLAN_CREDITS[productMapping.plan];
            await subscriptionRepository.updateSubscription(userId, {
                polar_customer_id: data.customer_id,
                polar_subscription_id: data.subscription_id,
                subscription_status: 'active',
                plan_type: productMapping.plan,
                billing_email: data.customer_email,
            }, client);
            await creditService.grantCreditsWithClient(client, userId, planCredits, `Subscription activated: ${productMapping.plan} plan`);
            log.info('Subscription checkout completed', { user_id: userId, plan: productMapping.plan });
        }
    }

    private async handleSubscriptionCreated(client: PoolClient, payload: Record<string, unknown>): Promise<void> {
        const data = extractData<PolarSubscriptionData>(payload, 'subscription.created');

        const userId = data.metadata?.user_id;
        if (!userId) {
            throw new WebhookProcessingError('subscription.created payload missing user_id in metadata');
        }
        if (!data.id) {
            throw new WebhookProcessingError('subscription.created payload missing subscription id');
        }

        const productMapping = data.product_id ? POLAR_PRODUCT_IDS[data.product_id] : undefined;

        await subscriptionRepository.updateSubscription(userId, {
            polar_customer_id: data.customer_id,
            polar_subscription_id: data.id,
            subscription_status: 'active',
            subscription_current_period_end: data.current_period_end ? new Date(data.current_period_end) : null,
            plan_type: productMapping?.plan,
        }, client);

        log.info('Subscription created', { user_id: userId, subscription_id: data.id });
    }

    private async handleSubscriptionUpdated(client: PoolClient, payload: Record<string, unknown>): Promise<void> {
        const data = extractData<PolarSubscriptionData>(payload, 'subscription.updated');

        if (!data.id) {
            throw new WebhookProcessingError('subscription.updated payload missing subscription id');
        }

        const user = await findUserBySubscriptionOrCustomer(client, data.id, data.customer_id, 'subscription.updated');
        if (!user) return;

        const productMapping = data.product_id ? POLAR_PRODUCT_IDS[data.product_id] : undefined;
        const oldPlan = user.plan_type;
        const newPlan = productMapping?.plan;

        const mappedStatus = POLAR_STATUS_MAP[data.status ?? ''] ?? user.subscription_status;

        await subscriptionRepository.updateSubscription(user.user_id, {
            subscription_status: mappedStatus,
            subscription_current_period_end: data.current_period_end ? new Date(data.current_period_end) : undefined,
            plan_type: newPlan,
        }, client);

        if (newPlan && newPlan !== oldPlan) {
            const targetCredits = PLAN_CREDITS[newPlan];
            const currentBalance = user.credits_available;
            const bonus = Math.max(0, targetCredits - currentBalance);
            if (bonus > 0) {
                await creditService.grantCreditsWithClient(client, user.user_id, bonus, `Plan upgrade: ${oldPlan} → ${newPlan}`);
            }
            log.info('Plan changed', { user_id: user.user_id, from: oldPlan, to: newPlan, bonus });
        }
    }

    private async handleSubscriptionCanceled(client: PoolClient, payload: Record<string, unknown>): Promise<void> {
        const data = extractData<PolarSubscriptionData>(payload, 'subscription.canceled');

        if (!data.id) {
            throw new WebhookProcessingError('subscription.canceled payload missing subscription id');
        }

        const user = await findUserBySubscriptionOrCustomer(client, data.id, data.customer_id, 'subscription.canceled');
        if (!user) return;

        await subscriptionRepository.updateSubscription(user.user_id, {
            subscription_status: 'canceled',
            subscription_current_period_end: data.current_period_end ? new Date(data.current_period_end) : undefined,
        }, client);

        log.info('Subscription canceled', { user_id: user.user_id, period_end: data.current_period_end });
    }

    private async handleSubscriptionRevoked(client: PoolClient, payload: Record<string, unknown>): Promise<void> {
        const data = extractData<PolarSubscriptionData>(payload, 'subscription.revoked');

        if (!data.id) {
            throw new WebhookProcessingError('subscription.revoked payload missing subscription id');
        }

        const user = await findUserBySubscriptionOrCustomer(client, data.id, data.customer_id, 'subscription.revoked');
        if (!user) return;

        await subscriptionRepository.updateSubscription(user.user_id, {
            subscription_status: 'revoked',
        }, client);

        log.info('Subscription revoked -- immediate block', { user_id: user.user_id });
    }

    private extractCustomerId(payload: Record<string, unknown>): string | null {
        const data = payload.data;
        if (!data || typeof data !== 'object') return null;
        const obj = data as Record<string, unknown>;
        return (typeof obj.customer_id === 'string' ? obj.customer_id : null);
    }

    private extractSubscriptionId(payload: Record<string, unknown>): string | null {
        const data = payload.data;
        if (!data || typeof data !== 'object') return null;
        const obj = data as Record<string, unknown>;
        return (typeof obj.id === 'string' ? obj.id : null)
            ?? (typeof obj.subscription_id === 'string' ? obj.subscription_id : null);
    }
}

export const billingService = new BillingService();
