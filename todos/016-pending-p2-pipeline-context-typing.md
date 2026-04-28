---
status: pending
priority: p2
issue_id: billing-polar-016
tags: [code-review, typescript]
---
# Loose String Types for Subscription Status and Plan Type

## Problem Statement
`PipelineContext.subscriptionStatus` is typed as `string | null` instead of `SubscriptionStatus | null`, and `BillingStatusResult.plan_type` is typed as `string` instead of `PlanType`. These loose types defeat TypeScript's ability to catch invalid status/plan comparisons at compile time, allowing typos and invalid values to slip through undetected.

## Findings
- File: `execution-pipeline.types.ts:129` — `subscriptionStatus: string | null` should be `SubscriptionStatus | null`
- File: `platform-tool.inlined-types.ts:481` — `plan_type: string` should be `PlanType`

## Proposed Solutions
1. Import the proper union types (`SubscriptionStatus`, `PlanType`) from the billing domain types
2. Replace the loose `string` types with the specific union types:
   ```typescript
   // execution-pipeline.types.ts
   subscriptionStatus: SubscriptionStatus | null;
   
   // platform-tool.inlined-types.ts
   plan_type: PlanType;
   ```

## Acceptance Criteria
- [ ] `PipelineContext.subscriptionStatus` typed as `SubscriptionStatus | null`
- [ ] `BillingStatusResult.plan_type` typed as `PlanType`
- [ ] TypeScript catches invalid subscription status comparisons at compile time
- [ ] TypeScript catches invalid plan type comparisons at compile time
- [ ] No type assertion (`as string`) workarounds introduced
