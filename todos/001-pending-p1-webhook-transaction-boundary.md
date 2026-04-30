---
status: pending
priority: p1
issue_id: billing-polar-001
tags: [code-review, data-integrity, billing]
---
# Webhook Transaction Boundary: Mutations Run on Separate DB Connections

## Problem Statement
`billing.service.ts` `processWebhookEvent` wraps the idempotency check in a transaction, but `subscriptionRepository.updateSubscription()` uses a standalone `query()` call and `creditService.grantCredits()` opens its own independent transaction. All three operations run on SEPARATE database connections. If the credit grant fails after the subscription update has already succeeded, the webhook is marked as processed but the user is left in an incomplete state -- subscription updated but credits not granted. This violates atomicity and can cause silent data corruption that is extremely difficult to detect or recover from.

## Findings
- `billing.service.ts` lines 24-57: `processWebhookEvent` opens a transaction for idempotency check via `webhookRepository.insertIfNotExists`, but downstream mutations escape this transaction boundary.
- `subscription.repository.ts`: `updateSubscription()` calls `query()` directly instead of accepting and using a `PoolClient` from the outer transaction. This means it acquires a separate connection from the pool.
- `credit-service.ts` lines 201-218: `grantCredits()` opens its own `BEGIN`/`COMMIT` transaction on a fresh connection, completely independent of the webhook transaction.
- `webhookRepository.insertIfNotExists` already demonstrates the correct pattern -- it accepts a `PoolClient` parameter and participates in the caller's transaction.
- Flagged by: performance-oracle, security-sentinel, data-integrity-guardian, code-reviewer, architecture-strategist (5 agents)

## Proposed Solutions

### Option A: Pass PoolClient Through (Recommended)
Modify `processWebhookEvent` to acquire a single `PoolClient`, pass it to `subscriptionRepository.updateSubscription()`, `creditService.grantCredits()`, and `webhookRepository.insertIfNotExists`. All mutations share one transaction.
- **Pros**: Atomic, follows existing pattern (`insertIfNotExists`), minimal API surface change.
- **Cons**: Requires updating method signatures for `subscriptionRepository` and `creditService` to accept an optional `PoolClient`.

### Option B: Unit of Work Pattern
Create a `UnitOfWork` class that wraps a `PoolClient` and provides repository/service access scoped to one transaction.
- **Pros**: Cleaner long-term pattern, reusable across domains.
- **Cons**: Larger refactor, introduces new abstraction.

### Option C: Outbox Pattern
Write webhook mutations as events to an outbox table within the same transaction, then process them asynchronously.
- **Pros**: Decouples concerns, handles retries gracefully.
- **Cons**: Significant complexity increase, eventual consistency instead of immediate.

## Acceptance Criteria
- [ ] All mutations for a single webhook event share one DB transaction
- [ ] Partial failure (e.g., credit grant fails) rolls back ALL changes atomically, including subscription update and idempotency marker
- [ ] `subscriptionRepository.updateSubscription()` accepts an optional `PoolClient` parameter
- [ ] `creditService.grantCredits()` accepts an optional `PoolClient` parameter instead of opening its own transaction
- [ ] Integration test: simulate credit grant failure after subscription update and verify full rollback
- [ ] No webhook event is marked as "processed" unless all downstream mutations succeed
