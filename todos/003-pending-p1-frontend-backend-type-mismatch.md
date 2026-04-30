---
status: pending
priority: p1
issue_id: billing-polar-003
tags: [code-review, typescript, frontend]
---
# Frontend-Backend Type Mismatch: Subscription Fields Undefined at Runtime

## Problem Statement
The frontend `Subscription` interface (`xerus_web/lib/api/billing.ts:57-63`) defines field names `status`, `current_period_end`, `cancel_at_period_end`, and `interval`. The backend `GET /billing/subscription` endpoint returns `subscription_status`, `subscription_current_period_end`, and NEVER returns `cancel_at_period_end` or `interval` at all. The billing page reads `subscription.status` which is `undefined` at runtime, causing the UI to display incorrect or missing subscription information. Users cannot see their actual subscription status.

## Findings
- `xerus_web/lib/api/billing.ts` lines 57-68: Frontend `Subscription` interface defines `status`, `current_period_end`, `cancel_at_period_end`, `interval`.
- `xerus_backend/src/domains/billing/billing.routes.ts` lines 142-152: Backend returns fields prefixed with `subscription_` (e.g., `subscription_status`, `subscription_current_period_end`). Does not return `cancel_at_period_end` or `interval`.
- `xerus_web/app/settings/billing/page.tsx` line 62: Reads `subscription.status` -- undefined at runtime because backend sends `subscription_status`.
- `xerus_web/app/settings/billing/page.tsx` lines 214, 224-228: Additional reads of mismatched field names for period end and cancellation state.
- Flagged by: typescript-reviewer, code-reviewer, simplicity-reviewer, architecture-strategist (4 agents)

## Proposed Solutions

### Option A: Align Frontend to Backend (Recommended)
Update the frontend `Subscription` interface to match the backend response exactly: `subscription_status`, `subscription_current_period_end`, `polar_customer_id`, etc. Update all consumers in the billing page.
- **Pros**: No backend changes needed, single source of truth is the API response.
- **Cons**: Verbose field names on frontend, need to update all references.

### Option B: Align Backend to Frontend
Update the backend `GET /billing/subscription` response to use the shorter field names: `status`, `current_period_end`, etc. Add `cancel_at_period_end` and `interval` to the response.
- **Pros**: Cleaner frontend code, shorter field names.
- **Cons**: Breaking change for any other API consumers, need to add missing data (`cancel_at_period_end`, `interval`) which may require additional Polar API calls or DB columns.

### Option C: DTO Transform Layer
Add a response transformer in the backend route that maps DB column names (`subscription_status`) to API-friendly names (`status`).
- **Pros**: Clean separation, both sides use natural names.
- **Cons**: Extra layer to maintain, must stay in sync.

## Acceptance Criteria
- [ ] Frontend `Subscription` interface field names match backend `GET /billing/subscription` response exactly
- [ ] `subscription.status` (or equivalent aligned field) is NOT `undefined` at runtime
- [ ] Billing page correctly displays subscription status text
- [ ] Billing page correctly displays subscription period end date
- [ ] All field references in `billing/page.tsx` use the correct aligned field names
- [ ] TypeScript compilation passes with no type errors on billing page
- [ ] Manual verification: billing page renders correctly for active, canceled, and free-tier users
