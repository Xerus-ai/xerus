---
status: pending
priority: p2
issue_id: billing-polar-011
tags: [code-review, data-integrity, migration]
---
# Missing UNIQUE Constraints on Polar Customer and Subscription IDs

## Problem Statement
`polar_customer_id` and `polar_subscription_id` columns on the users table have no UNIQUE constraints. This means multiple users could theoretically be assigned the same Polar customer or subscription ID. `findByPolarSubscriptionId` silently picks the first row when duplicates exist, leading to unpredictable billing behavior and potential credit misattribution.

## Findings
The users table schema lacks unique constraints on both `polar_customer_id` and `polar_subscription_id` columns. Repository methods like `findByPolarSubscriptionId` return a single row without any guarantee of uniqueness at the database level.

## Proposed Solutions
Add partial unique indexes via a new migration:

```sql
CREATE UNIQUE INDEX idx_users_polar_customer_id 
  ON users(polar_customer_id) 
  WHERE polar_customer_id IS NOT NULL;

CREATE UNIQUE INDEX idx_users_polar_subscription_id 
  ON users(polar_subscription_id) 
  WHERE polar_subscription_id IS NOT NULL;
```

Partial indexes (with `WHERE ... IS NOT NULL`) allow multiple NULL values while enforcing uniqueness for non-null entries.

## Acceptance Criteria
- [ ] Database enforces one user per Polar customer ID
- [ ] Database enforces one user per Polar subscription ID
- [ ] NULL values are still allowed (partial unique index)
- [ ] Migration is idempotent (uses `IF NOT EXISTS`)
- [ ] Existing data validated for duplicates before migration is applied
