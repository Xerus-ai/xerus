import type { PlanType } from '../users/types';

export type BillingInterval = 'monthly' | 'annual';

export interface PlanConfig {
    label: string;
    credits: number;
    monthly: number;
    annual: number;
    vcpu: number;
    ram: number;
    disk: number;
}

export const PLANS: Record<PlanType, PlanConfig> = {
    pro: { label: 'Pro', credits: 500, monthly: 19, annual: 15, vcpu: 1, ram: 2, disk: 10 },
    max: { label: 'Max', credits: 2000, monthly: 49, annual: 39, vcpu: 2, ram: 4, disk: 25 },
    ultra: { label: 'Ultra', credits: 10000, monthly: 149, annual: 119, vcpu: 4, ram: 8, disk: 50 },
};

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

