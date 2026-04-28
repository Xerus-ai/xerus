---
status: pending
priority: p1
issue_id: billing-polar-007
tags: [code-review, compliance]
---
# Fallback Patterns: Multiple CLAUDE.md "NO Fallbacks" Violations

## Problem Statement
Multiple locations violate the CLAUDE.md non-negotiable rule "NO fallbacks": `catch { return default }` patterns must not exist. Silent fallbacks mask bugs, produce incorrect behavior, and make debugging extremely difficult. Each violation identified below silently swallows errors or substitutes default values instead of failing fast, which is the required behavior per project rules.

## Findings

### (A) `execution-pipeline.ts:597` -- Unknown Plan Defaults to 500 Credits
`PLAN_CREDITS[plan] ?? 500` silently defaults to 500 credits for any unknown plan type. If a new plan is added but not mapped, users get arbitrary credit limits with no error. This could over- or under-provision credits.

### (B) `execution-pipeline.ts:611-637` -- `finalizeCredits` Catches Constraint Violations
`finalizeCredits` catches database constraint violations and zeros the balance instead of throwing. Credit accounting errors are silently swallowed. A user could lose their remaining credits with no error trail.

### (C) `billing.routes.ts:66,98` -- `FRONTEND_URL` Falls Back to Localhost
`FRONTEND_URL || 'http://localhost:3002'` silently falls back to localhost in production if the environment variable is missing. Checkout success/cancel redirects would send users to localhost, which is unreachable -- but the error is invisible because no exception is thrown.

### (D) `sandbox.service.ts:163-174` -- Resize Catch-and-Continue with Plan Fallback
Sandbox resize failure is caught and execution continues with `plan_type || 'pro'` fallback. A resize failure means the user's sandbox is undersized for their plan, but no error is surfaced. The `|| 'pro'` fallback means unknown plans default to pro-tier resources.

- Flagged by: compliance-checker, architecture-strategist (2 agents)

## Proposed Solutions

### (A) Throw on Unknown Plan
Replace `PLAN_CREDITS[plan] ?? 500` with an explicit check: if `plan` is not in `PLAN_CREDITS`, throw an error. All valid plans must be mapped.
- **Pros**: Immediately catches configuration gaps.
- **Cons**: Requires ensuring all plans are mapped before deployment.

### (B) Handle Credit Exhaustion as Explicit Code Path
Instead of catching constraint violations and zeroing balance, make credit exhaustion an explicit, typed code path (e.g., `InsufficientCreditsError`). Let the caller decide how to handle it.
- **Pros**: Clear error semantics, auditable.
- **Cons**: Callers must handle the new error type.

### (C) Throw on Missing `FRONTEND_URL`
Validate `FRONTEND_URL` at startup. If not set, throw immediately during server initialization. Do not allow the server to start without required configuration.
- **Pros**: Fail-fast at deployment time, not at user request time.
- **Cons**: Requires ensuring env var is set in all environments (dev, staging, prod).

### (D) Throw on Resize Failure
When sandbox resize fails, throw an error or make it an explicit degradation path with logging and user notification -- not a silent catch-and-continue.
- **Pros**: Visible failures, actionable alerts.
- **Cons**: May need graceful handling if resize is non-critical to the operation.

## Acceptance Criteria
- [ ] `PLAN_CREDITS[plan] ?? 500` replaced with explicit validation that throws on unknown plan
- [ ] `finalizeCredits` does not catch constraint violations to zero balance -- credit exhaustion is an explicit error path
- [ ] `FRONTEND_URL || 'http://localhost:3002'` replaced with startup validation that throws if `FRONTEND_URL` is not set
- [ ] `sandbox.service.ts` resize failure throws or uses explicit degradation path with logging, not silent catch-and-continue
- [ ] `plan_type || 'pro'` fallback removed -- unknown plan types throw errors
- [ ] Zero `catch { return default }` patterns remain in billing, execution, and sandbox domains
- [ ] All unknown/missing states result in thrown errors, not silent defaults
- [ ] `npm run lint && npm run typecheck` passes
- [ ] Existing tests updated to expect errors on invalid inputs instead of fallback values
