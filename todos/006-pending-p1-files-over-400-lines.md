---
status: pending
priority: p1
issue_id: billing-polar-006
tags: [code-review, compliance, architecture]
---
# Files Over 400 Lines: CLAUDE.md Compliance Violation

## Problem Statement
Two files significantly exceed the 400-line CLAUDE.md limit: `execution-pipeline.ts` (750 lines) and `billing.service.test.ts` (603 lines). Per CLAUDE.md non-negotiables: "Files < 400 lines" -- monolithic files must be split into focused modules. These oversized files indicate accumulated responsibilities that should be separated for maintainability, testability, and code review clarity.

## Findings
- `xerus_backend/src/domains/execution/execution-pipeline.ts`: 750 lines. Contains `reserveCredits` with subscription tier checks, `finalizeCredits` with credit accounting logic, plus the core execution pipeline orchestration. At least three distinct responsibilities in one file.
- `xerus_backend/src/domains/billing/__tests__/billing.service.test.ts`: 603 lines. Contains checkout tests, subscription lifecycle tests, idempotency tests, and shared setup/teardown -- all in one file.
- Flagged by: pattern-recognition, architecture-strategist, compliance-checker, typescript-reviewer, simplicity-reviewer (5 agents)

## Proposed Solutions

### Option A: Extract by Responsibility (Recommended)

**For `execution-pipeline.ts` (750 lines):**
- Extract `reserveCredits` and subscription tier validation logic into `subscription-guard.ts` (~150 lines)
- Extract `finalizeCredits` and credit balance accounting into `credit-finalization.ts` (~150 lines)
- Keep core pipeline orchestration in `execution-pipeline.ts` (~450 -> further split if still over 400)

**For `billing.service.test.ts` (603 lines):**
- Split into `checkout.test.ts` (checkout completed tests)
- Split into `subscription-lifecycle.test.ts` (created, updated, canceled, revoked tests)
- Split into `idempotency.test.ts` (duplicate webhook tests)
- Extract shared setup into `test-helpers.ts`

- **Pros**: Each file has single responsibility, easier to review, test, and modify independently.
- **Cons**: More files to navigate, need to verify imports/exports are correct after split.

### Option B: Partial Extract (Minimum Compliance)
Only extract enough to get each file under 400 lines without full responsibility separation.
- **Pros**: Minimal change.
- **Cons**: Doesn't address the underlying design issue, may need re-splitting later.

## Acceptance Criteria
- [ ] `execution-pipeline.ts` is under 400 lines
- [ ] `subscription-guard.ts` exists with `reserveCredits` and subscription tier logic
- [ ] `credit-finalization.ts` exists with `finalizeCredits` and credit accounting logic
- [ ] `billing.service.test.ts` is under 400 lines (or replaced by split files)
- [ ] `checkout.test.ts`, `subscription-lifecycle.test.ts`, `idempotency.test.ts` exist with focused tests
- [ ] `test-helpers.ts` contains shared setup/teardown and fixtures
- [ ] All existing tests still pass after the split
- [ ] No file in the billing or execution domains exceeds 400 lines
- [ ] `npm run lint && npm run typecheck` passes
