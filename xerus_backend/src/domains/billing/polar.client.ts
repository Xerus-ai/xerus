import { Polar } from '@polar-sh/sdk';
import { logger } from '../../utils/logger';

const log = logger('PolarClient');

let polarClient: Polar | null = null;

export function getClient(): Polar {
    if (!polarClient) {
        const accessToken = process.env.POLAR_ACCESS_TOKEN;
        if (!accessToken) {
            throw new Error('POLAR_ACCESS_TOKEN is not configured');
        }
        const isSandbox = process.env.POLAR_ENVIRONMENT === 'sandbox';
        polarClient = new Polar({
            accessToken,
            server: isSandbox ? 'sandbox' : 'production',
        });
    }
    return polarClient;
}

export async function createCheckoutSession(params: {
    productId: string;
    successUrl?: string;
    customerEmail?: string;
    metadata?: Record<string, string>;
}): Promise<{ id: string; url: string }> {
    const client = getClient();

    const checkout = await client.checkouts.create({
        products: [params.productId],
        ...(params.successUrl ? { successUrl: params.successUrl } : {}),
        customerEmail: params.customerEmail,
        metadata: params.metadata,
    });

    log.info('Polar checkout session created', { checkout_id: checkout.id });
    return { id: checkout.id, url: checkout.url };
}

export async function getCustomerPortalUrl(customerId: string): Promise<string> {
    const client = getClient();

    const session = await client.customerSessions.create({
        customerId,
    });

    return session.customerPortalUrl;
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
    const client = getClient();
    await client.subscriptions.update({
        id: subscriptionId,
        subscriptionUpdate: { cancelAtPeriodEnd: true },
    });
    log.info('Polar subscription canceled', { subscription_id: subscriptionId });
}

export async function updateSubscription(subscriptionId: string, productId: string): Promise<void> {
    const client = getClient();
    await client.subscriptions.update({
        id: subscriptionId,
        subscriptionUpdate: { productId },
    });
    log.info('Polar subscription updated', { subscription_id: subscriptionId, product_id: productId });
}

