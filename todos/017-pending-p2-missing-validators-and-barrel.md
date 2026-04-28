---
status: pending
priority: p2
issue_id: billing-polar-017
tags: [code-review, architecture, patterns]
---
# Billing Domain Missing Validators, Barrel Exports, and Migration Transaction

## Problem Statement
The billing domain deviates from established patterns used by every other domain: (A) Joi validation schemas are defined inline in `billing.routes.ts` instead of a dedicated `billing.validators.ts`, (B) `billing/index.ts` barrel file doesn't re-export error classes, and (C) migration 088 is not wrapped in `BEGIN/COMMIT` unlike other migrations.

## Findings
### (A) Missing Validators File
File: `billing.routes.ts` — Joi schemas defined inline in route file. Every other domain has a dedicated `validators.ts` file.

### (B) Incomplete Barrel Exports
File: `billing/index.ts` — does not re-export error classes from `errors.ts`, forcing consumers to import from deep paths.

### (C) Missing Transaction Wrapper
Migration 088 is not wrapped in `BEGIN/COMMIT` transaction block, unlike the pattern established by other migrations. A partial failure could leave the schema in an inconsistent state.

## Proposed Solutions
1. **(A)** Create `billing.validators.ts` with all Joi schemas extracted from `billing.routes.ts`. Import them in the routes file.
2. **(B)** Add error class exports to `billing/index.ts`:
   ```typescript
   export { BillingError, PolarApiError, ... } from './errors';
   ```
3. **(C)** Wrap migration 088 in `BEGIN; ... COMMIT;` transaction block.

## Acceptance Criteria
- [ ] `billing.validators.ts` exists with all Joi schemas from routes
- [ ] `billing.routes.ts` imports validators from `billing.validators.ts`
- [ ] `billing/index.ts` re-exports all error classes
- [ ] Migration 088 wrapped in transaction block
- [ ] Billing domain structure matches pattern of other domains (e.g., agents, execution)
