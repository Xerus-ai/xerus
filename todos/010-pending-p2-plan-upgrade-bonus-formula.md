---
status: pending
priority: p2
issue_id: billing-polar-010
tags: [code-review, billing, logic-bug]
---
# Plan Upgrade Bonus Formula Ignores Already-Used Credits

## Problem Statement
`handleSubscriptionUpdated` computes the credit bonus on plan upgrade as `bonus = PLAN_CREDITS[newPlan] - PLAN_CREDITS[oldPlan]`. This formula ignores how many credits the user has already consumed. A user on Pro (500 credits) who has used 400 credits and upgrades to Max (2000 credits) receives a 1500 bonus, bringing their total to 1600 instead of the expected 2000. The upgrade should bring the user to the full new plan allocation.

## Findings
File: `billing.service.ts:163-169`

The bonus calculation uses static plan credit values rather than the user's actual remaining balance (`credits_available`), leading to incorrect post-upgrade credit totals.

## Proposed Solutions
Change the bonus formula to account for the user's current balance:

```typescript
const bonus = Math.max(0, PLAN_CREDITS[newPlan] - currentBalance);
```

This ensures the user is brought up to the full new plan allocation regardless of how many credits they have already consumed. The `Math.max(0, ...)` guard prevents negative adjustments if the user somehow has more credits than the new plan offers.

## Acceptance Criteria
- [ ] Plan upgrade always brings user to full new plan credit allocation
- [ ] Already-consumed credits are accounted for in bonus calculation
- [ ] No negative credit adjustments on edge cases (e.g., downgrade or overage)
- [ ] Unit test covering: user with partial usage upgrading receives correct final balance
