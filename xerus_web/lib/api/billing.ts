/**
 * Billing API Module
 * Checkout, subscription management, and portal access
 */
import { apiCall } from './client';
import type { PlanType } from '@/lib/plans';

// ============================================================
// CHECKOUT
// ============================================================

export interface CheckoutResponse {
  checkout_url: string;
  checkout_id: string;
}

export const createCheckout = async (
  plan: PlanType,
  interval: 'monthly' | 'annual',
): Promise<CheckoutResponse> => {
  const response = await apiCall('/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan, interval }),
  });
  const json = await response.json();
  return json.data ?? json;
};

export const createCreditCheckout = async (
  credits: 500 | 2000 | 5000,
): Promise<CheckoutResponse> => {
  const response = await apiCall('/billing/checkout/credits', {
    method: 'POST',
    body: JSON.stringify({ credits }),
  });
  const json = await response.json();
  return json.data ?? json;
};

// ============================================================
// PORTAL
// ============================================================

export interface PortalResponse {
  portal_url: string;
}

export const getPortalUrl = async (): Promise<PortalResponse> => {
  const response = await apiCall('/billing/portal', { method: 'GET' });
  const json = await response.json();
  return json.data ?? json;
};

// ============================================================
// SUBSCRIPTION
// ============================================================

export interface Subscription {
  plan_type: string;
  subscription_status: 'active' | 'canceled' | 'past_due' | 'revoked' | 'pending';
  subscription_current_period_end: string | null;
  polar_customer_id: string | null;
  polar_subscription_id: string | null;
  credits_available: number;
  credits_used: number;
  credits_reset_date: string | null;
}

export const getSubscription = async (): Promise<Subscription> => {
  const response = await apiCall('/billing/subscription', { method: 'GET' });
  const json = await response.json();
  return json.data ?? json;
};

export const cancelSubscription = async (): Promise<void> => {
  await apiCall('/billing/subscription/cancel', { method: 'POST' });
};

export const changePlan = async (
  plan: PlanType,
  interval: 'monthly' | 'annual',
): Promise<void> => {
  await apiCall('/billing/subscription/change', {
    method: 'POST',
    body: JSON.stringify({ plan, interval }),
  });
};

// ============================================================
// USAGE
// ============================================================

export interface UsageByAgent {
  agent_slug: string;
  credits: number;
}

export interface UsageByDay {
  date: string;
  credits: number;
}

export interface UsageData {
  by_agent: UsageByAgent[];
  by_day: UsageByDay[];
}

export const getUsage = async (): Promise<UsageData> => {
  const response = await apiCall('/billing/usage', { method: 'GET' });
  const json = await response.json();
  return json.data ?? json;
};
