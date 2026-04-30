---
status: pending
priority: p1
issue_id: billing-polar-002
tags: [code-review, data-integrity, billing]
---
# Subscription Event Ordering: Out-of-Order Webhooks Permanently Lost

## Problem Statement
`handleCheckoutCompleted` does NOT set `polar_subscription_id` -- it only writes `polar_customer_id`, `subscription_status`, `plan_type`, and `billing_email`. The `polar_subscription_id` is ONLY written by `handleSubscriptionCreated`. If a `subscription.updated`, `subscription.canceled`, or `subscription.revoked` event arrives before `subscription.created`, the handler calls `findByPolarSubscriptionId()` which returns null. The handler then silently returns without processing the event, and the webhook row is committed as "processed." The subscription status change is permanently lost with no error, no retry, and no way to detect the data inconsistency.

## Findings
- `billing.service.ts` lines 86-91: `handleCheckoutCompleted` writes `polar_customer_id`, `subscription_status`, `plan_type`, `billing_email` but NOT `polar_subscription_id`. The subscription ID from the checkout payload is ignored.
- `billing.service.ts` lines 145-149: `handleSubscriptionUpdated` calls `findByPolarSubscriptionId()`. If null, silently returns -- no error, no log, no retry.
- `billing.service.ts` lines 187-190: `handleSubscriptionCanceled` has the same silent-return-on-null pattern.
- `billing.service.ts` lines 212-215: `handleSubscriptionRevoked` has the same silent-return-on-null pattern.
- Flagged by: code-reviewer (100% confidence), data-integrity-guardian (2 agents)

## Proposed Solutions

### Option A: Write `polar_subscription_id` in `handleCheckoutCompleted` (Recommended)
When `handleCheckoutCompleted` processes a checkout event, also write `polar_subscription_id` from the payload if present. This ensures subsequent subscription lifecycle events can find the record.
- **Pros**: Simplest fix, addresses root cause, checkout payload typically contains subscription ID.
- **Cons**: Depends on Polar including subscription_id in checkout payload.

### Option B: Fallback Lookup by `polar_customer_id`
When `findByPolarSubscriptionId()` returns null, fall back to `findByPolarCustomerId()` to locate the subscription record.
- **Pros**: Handles edge cases where subscription_id isn't in checkout payload.
- **Cons**: Customer may have multiple subscriptions, could match wrong one.

### Option C: Don't Commit Webhook on No-Op
When a handler does a "subscription not found" silent return, do NOT mark the webhook event as processed. Instead, throw a retryable error so the webhook can be reprocessed after `subscription.created` arrives.
- **Pros**: Handles all ordering edge cases, self-healing on retry.
- **Cons**: Requires retry logic, could cause webhook flood if `subscription.created` never arrives.

### Option D: Combine A + C
Write `polar_subscription_id` in checkout AND refuse to commit webhook events that result in a no-op lookup. Belt and suspenders.
- **Pros**: Most robust -- covers both the common case and edge cases.
- **Cons**: Slightly more complex implementation.

## Acceptance Criteria
- [ ] A `subscription.revoked` event arriving before `subscription.created` still correctly revokes the user's access
- [ ] A `subscription.updated` event arriving before `subscription.created` still correctly updates the subscription
- [ ] A `subscription.canceled` event arriving before `subscription.created` still correctly cancels the subscription
- [ ] No webhook handler silently discards events without either processing them or marking them for retry
- [ ] Integration test: deliver `subscription.revoked` before `subscription.created` and verify correct final state
- [ ] `handleCheckoutCompleted` writes `polar_subscription_id` when available in the payload
