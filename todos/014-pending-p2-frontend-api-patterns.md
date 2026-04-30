---
status: pending
priority: p2
issue_id: billing-polar-014
tags: [code-review, typescript, frontend]
---
# Frontend API Pattern Issues in Billing Module

## Problem Statement
Multiple frontend API and type issues in the billing module reduce type safety and introduce data duplication: (A) unsafe API response unwrapping, (B) incomplete response types, (C) duplicated plan label data, and (D) hardcoded plan data in UI components.

## Findings
### (A) Unsafe API Response Unwrapping
File: `xerus_web/lib/api/billing.ts:25,36,50,68,107`
`json.data || json` uses logical OR which falls through on falsy values (e.g., `0`, `""`, `false`). Should use nullish coalescing or strict unwrapping.

### (B) Missing Type Field
File: `xerus_web/lib/api/billing.ts:12-14`
`CheckoutResponse` type is missing the `checkout_id` field that the API returns.

### (C) Duplicated Plan Labels
File: `xerus_web/app/(app)/settings/billing/page.tsx:26-30`
`PLAN_LABELS` duplicates label data already available in the `PLANS` constant.

### (D) Hardcoded Plan Data
File: `xerus_web/components/PlanComparisonGrid.tsx:22-63`
`PlanComparisonGrid` hardcodes plan features and pricing instead of deriving them from the `PLANS` constant.

## Proposed Solutions
1. **(A)** Replace `json.data || json` with `json.data ?? json` or implement a strict API response unwrapper
2. **(B)** Add `checkout_id: string` to `CheckoutResponse` type definition
3. **(C)** Replace `PLAN_LABELS` usage with `PLANS[plan].label`
4. **(D)** Refactor `PlanComparisonGrid` to derive plan data from the `PLANS` constant

## Acceptance Criteria
- [ ] No `||` used for API response unwrapping — all use `??` or strict unwrap
- [ ] `CheckoutResponse` type includes `checkout_id` field
- [ ] No duplicated plan label mappings — single source of truth via `PLANS`
- [ ] `PlanComparisonGrid` derives all plan data from `PLANS` constant
- [ ] TypeScript compilation passes with no new errors
