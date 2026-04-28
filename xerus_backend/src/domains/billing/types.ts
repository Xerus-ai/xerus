import type { PlanType } from '../users/types';

export type BillingInterval = 'monthly' | 'annual';

export const POLAR_PRODUCT_IDS: Record<string, { plan: PlanType; interval: BillingInterval }> = {
    '8c0fcae3-61f7-4ac1-bf99-8b4b92db7450': { plan: 'pro', interval: 'monthly' },
    '1295531f-2155-43f6-b608-eeb9856e0f6e': { plan: 'pro', interval: 'annual' },
    '8c035eb9-f9b3-4c2d-9234-fffcceb3cbdd': { plan: 'max', interval: 'monthly' },
    '047af170-7274-4a5b-bdca-424e96856ab2': { plan: 'max', interval: 'annual' },
    '5fcadb65-c3f7-44a0-8269-eb6d4198bb5d': { plan: 'ultra', interval: 'monthly' },
    'c672417d-9eb5-4084-9300-b1cfcc91d4de': { plan: 'ultra', interval: 'annual' },
};

export const CREDIT_TOPUP_PRODUCTS: Record<string, number> = {
    'e62b0f56-7ef2-44bf-b187-f1993d27e42d': 500,
    '9457cf80-2deb-4c88-88b9-f905e5eefd26': 2000,
    '12dbb3d4-3630-4e84-bf5b-87c0630d61c0': 5000,
};

export type PolarWebhookEventType =
    | 'checkout.completed'
    | 'subscription.created'
    | 'subscription.updated'
    | 'subscription.canceled'
    | 'subscription.revoked';

