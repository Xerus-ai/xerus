---
status: pending
priority: p2
issue_id: billing-polar-012
tags: [code-review, simplicity]
---
# Deprecated and Dead Code in Billing Domain

## Problem Statement
The billing domain ships multiple pieces of dead code: deprecated methods that are never called, error classes that are never imported, and type definitions that are never consumed. Dead code increases cognitive load, creates false signals during code search, and risks accidental use of deprecated paths.

## Findings
- File: `webhook.repository.ts:35-63` — `exists()` and `insert()` methods marked `@deprecated`, never called anywhere in the codebase
- File: `errors.ts:9-13` — `SubscriptionNotFoundError` class defined but never imported
- File: `errors.ts:33-37` — `WebhookProcessingError` class defined but never imported
- File: `types.ts:5-19` — `PLANS` constant and `PlanConfig` type defined but never consumed by backend code

## Proposed Solutions
Delete all dead code. Git history preserves the implementations if they are ever needed again:

1. Remove `exists()` and `insert()` from `webhook.repository.ts`
2. Remove `SubscriptionNotFoundError` and `WebhookProcessingError` from `errors.ts`
3. Remove `PLANS` and `PlanConfig` from `types.ts` (verify frontend doesn't import from backend first)

## Acceptance Criteria
- [ ] Zero `@deprecated` methods in billing domain code
- [ ] Zero unused error class exports in `errors.ts`
- [ ] Zero unused type/constant exports in `types.ts`
- [ ] No new imports of removed code elsewhere in the codebase
- [ ] All existing tests continue to pass
