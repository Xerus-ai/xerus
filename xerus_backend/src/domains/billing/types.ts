import type { PlanType } from '../users/types';

export type BillingInterval = 'monthly' | 'annual';

const PRODUCTION_PRODUCT_IDS: Record<string, { plan: PlanType; interval: BillingInterval }> = {
    '8c0fcae3-61f7-4ac1-bf99-8b4b92db7450': { plan: 'pro', interval: 'monthly' },
    '1295531f-2155-43f6-b608-eeb9856e0f6e': { plan: 'pro', interval: 'annual' },
    '8c035eb9-f9b3-4c2d-9234-fffcceb3cbdd': { plan: 'max', interval: 'monthly' },
    '047af170-7274-4a5b-bdca-424e96856ab2': { plan: 'max', interval: 'annual' },
    '5fcadb65-c3f7-44a0-8269-eb6d4198bb5d': { plan: 'ultra', interval: 'monthly' },
    'c672417d-9eb5-4084-9300-b1cfcc91d4de': { plan: 'ultra', interval: 'annual' },
};

const SANDBOX_PRODUCT_IDS: Record<string, { plan: PlanType; interval: BillingInterval }> = {
    'd65a85ad-689e-4c97-844c-6c6e13261e38': { plan: 'pro', interval: 'monthly' },
    '3279ba6a-d7f7-4f26-9979-b51e8853555e': { plan: 'pro', interval: 'annual' },
    '5f7744cf-29c3-4fbb-8479-67537fe12b40': { plan: 'max', interval: 'monthly' },
    'da3104a5-b94d-471e-bb81-4e18fb905264': { plan: 'max', interval: 'annual' },
    '7cb69255-80d6-42b4-8991-ec40cbbdc64d': { plan: 'ultra', interval: 'monthly' },
    '4e1e28e2-5fab-4995-b742-c40764fb348e': { plan: 'ultra', interval: 'annual' },
};

const PRODUCTION_TOPUP_PRODUCTS: Record<string, number> = {
    'e62b0f56-7ef2-44bf-b187-f1993d27e42d': 500,
    '9457cf80-2deb-4c88-88b9-f905e5eefd26': 2000,
    '12dbb3d4-3630-4e84-bf5b-87c0630d61c0': 5000,
};

const SANDBOX_TOPUP_PRODUCTS: Record<string, number> = {
    '1b3cd801-3b04-4868-ac05-880ea93f198e': 500,
    '7f23dbac-0ca8-4a0a-8345-58db2a99debc': 2000,
    'ad13e08d-e10f-40fd-9807-87507dd30374': 5000,
};

const isSandbox = process.env.POLAR_ENVIRONMENT === 'sandbox';

export const POLAR_PRODUCT_IDS = isSandbox ? SANDBOX_PRODUCT_IDS : PRODUCTION_PRODUCT_IDS;
export const CREDIT_TOPUP_PRODUCTS = isSandbox ? SANDBOX_TOPUP_PRODUCTS : PRODUCTION_TOPUP_PRODUCTS;

export type PolarWebhookEventType =
    | 'checkout.completed'
    | 'subscription.created'
    | 'subscription.updated'
    | 'subscription.canceled'
    | 'subscription.revoked';

