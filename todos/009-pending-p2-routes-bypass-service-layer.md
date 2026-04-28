---
status: pending
priority: p2
issue_id: billing-polar-009
tags: [code-review, architecture]
---
# Billing Routes Bypass Service Layer with Direct DB and Repo Access

## Problem Statement
`billing.routes.ts` imports `query` directly and runs raw SQL for the `/usage` endpoint (lines 210-237). It also imports `userRepository` directly for 5 endpoints. This violates the established routes → services → repos → DB layering pattern that every other domain follows, creating tight coupling and making the billing domain harder to test and maintain.

## Findings
- File: `billing.routes.ts:8` — direct import of `query` from database module
- File: `billing.routes.ts:210-237` — raw SQL execution in route handler for `/usage` endpoint
- File: `billing.routes.ts:9` — direct import of `userRepository`
- File: `billing.routes.ts:65,97,122,164,187` — direct `userRepository` calls in route handlers

## Proposed Solutions
1. Move the usage query logic into `BillingService.getUsage()` method
2. Move all user lookup calls into appropriate `BillingService` methods that internally delegate to repos
3. Remove direct `query` and `userRepository` imports from `billing.routes.ts`
4. Route handlers should only call `BillingService` methods

## Acceptance Criteria
- [ ] `billing.routes.ts` has zero direct `query()` imports
- [ ] `billing.routes.ts` has zero direct `userRepository` imports
- [ ] All database access flows through service → repository layer
- [ ] `/usage` endpoint functionality preserved via `BillingService.getUsage()`
- [ ] All 5 endpoints using `userRepository` refactored to use service methods
