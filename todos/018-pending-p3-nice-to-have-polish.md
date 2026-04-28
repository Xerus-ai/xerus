---
status: pending
priority: p3
issue_id: billing-polar-018
tags: [code-review, polish]
---
# P3 Nice-to-Have Polish Items

## Items

### 1. Agent credit warning push mechanism
Credit warnings via SSE only reach frontend. Agents in sandbox are blind. Consider writing `.xerus/status/credit-warning.json` to workspace or including credit status in agent startup context.
- Files: execution-pipeline.ts:589-604

### 2. Agent-actionable error messages
reserveCredits error messages are human-oriented ("update your payment method"). Agents can't act on these. Append guidance like "Use send_notification to alert the user."
- File: execution-pipeline.ts:358-382

### 3. Add credits_total to BillingStatusResult
Agents need total allocation to calculate percentage. Add `credits_total: PLAN_CREDITS[plan_type]` to the tool result.
- File: billing.tools.ts:60-66, platform-tool.inlined-types.ts

### 4. Plan config duplicated across 3 files
`PLAN_CREDITS` in users/types.ts, `PLANS` in billing/types.ts, `PLANS` in frontend lib/plans.ts. Single source of truth needed.

### 5. Credit reset job error handling
Jobs log errors but don't emit metrics/alerts. Add obs DB tracking for failed credit resets.
- Files: credit-reset.ts:23-25, stale-session-cleanup.ts:27-29

### 6. Webhook events retention policy
polar_webhook_events table grows unbounded. Add ttl_expires_at column or document cleanup schedule.

### 7. Migration 087/089 comment discrepancy
089 says "087 incorrectly defaulted to active" but current 087 shows DEFAULT 'pending'. Verify against production and add clarifying comment.

### 8. subscription_status nullable vs NOT NULL
Migration 087 adds column without NOT NULL but test schema and TypeScript types assume non-nullable. Add NOT NULL to migration or update types.

### 9. HITL case for get_billing_status
Add explicit case in hitl-rules.ts buildHitlReason switch for GET_BILLING_STATUS instead of relying on default.

### 10. DaytonaProvider.resizeSandbox missing from interface
Method exists on concrete class but not on SandboxProvider interface. Add to interface for type safety.

### 11. webhook.handler.ts returns res.json() directly
Webhook sends bare 200/401 instead of using sendResponse(). Deliberate for Polar compatibility but worth documenting.

### 12. UsageDashboard maxCredits computed inside .map()
Compute Math.max once before the loop instead of on every iteration.
- File: UsageDashboard.tsx:46,90

### 13. Billing page error handling inconsistency  
Individual .catch() on getSubscription/getUsage swallow errors. getCreditBalance failure triggers billingError but subscription/usage failures are silent.
- File: settings/billing/page.tsx:43-57

### 14. Test afterAll bare catch block
billing.service.test.ts:141-148 catches ALL errors in afterAll. Narrow to expected pool-close error.

### 15. Test location inconsistency
Billing tests at src/domains/billing/__tests__/ vs users tests at tests/users/. Codebase-wide inconsistency.
