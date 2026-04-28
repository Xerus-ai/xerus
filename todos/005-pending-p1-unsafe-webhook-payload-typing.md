---
status: pending
priority: p1
issue_id: billing-polar-005
tags: [code-review, typescript, security]
---
# Unsafe Webhook Payload Typing: Cascading `as` Casts Without Validation

## Problem Statement
All 5 webhook handlers in `billing.service.ts` use cascading `as` type assertions on `Record<string, unknown>` without any runtime validation: `payload.data as Record<string, unknown>`, `data.product_id as string`, `data.metadata as Record<string, string>`. If Polar changes their payload shape (field renamed, nested differently, or type changed), the code silently receives garbage data instead of failing fast. This could lead to incorrect subscription states, wrong plan assignments, or credit miscalculation -- all without any error being thrown. The `as` casts completely bypass TypeScript's type safety at the exact boundary where validation matters most.

## Findings
- `billing.service.ts` lines 60-70: `handleCheckoutCompleted` casts `payload.data as Record<string, unknown>`, then `data.product_id as string`, `data.metadata as Record<string, string>`, `metadata.user_id as string`.
- `billing.service.ts` lines 97-108: `handleSubscriptionCreated` same cascading cast pattern on subscription fields.
- `billing.service.ts` lines 130-140: `handleSubscriptionUpdated` same pattern.
- `billing.service.ts` lines 175-183: `handleSubscriptionCanceled` same pattern.
- `billing.service.ts` lines 202-210: `handleSubscriptionRevoked` same pattern.
- Flagged by: typescript-reviewer

## Proposed Solutions

### Option A: Zod Schemas at Webhook Boundary (Recommended)
Define Zod schemas for each Polar event type (`PolarCheckoutPayload`, `PolarSubscriptionPayload`, etc.) and validate in `processWebhookEvent` before dispatching to handlers. Handlers receive typed, validated data.
- **Pros**: Runtime validation, auto-generated TypeScript types, descriptive error messages on invalid payloads, composable schemas.
- **Cons**: Adds Zod dependency (likely already in project), need to keep schemas in sync with Polar's API.

### Option B: Manual Runtime Checks
Add explicit `typeof` / `in` checks before each field access. Throw `WebhookProcessingError` if any check fails.
- **Pros**: No new dependencies, straightforward.
- **Cons**: Verbose, error-prone, easy to miss a field, no schema reuse.

### Option C: Polar SDK Types
If Polar provides TypeScript SDK types, import and use them directly with a validation layer.
- **Pros**: Authoritative types from the source.
- **Cons**: Depends on Polar SDK quality, may still need runtime validation.

## Acceptance Criteria
- [ ] Zero `as` type casts on webhook payload data in `billing.service.ts`
- [ ] All webhook payload fields are validated at runtime before use
- [ ] Invalid payloads throw `WebhookProcessingError` with descriptive message identifying which field failed validation
- [ ] Typed interfaces exist for each Polar event: `PolarCheckoutData`, `PolarSubscriptionCreatedData`, `PolarSubscriptionUpdatedData`, `PolarSubscriptionCanceledData`, `PolarSubscriptionRevokedData`
- [ ] Validation occurs in `processWebhookEvent` before dispatching to individual handlers
- [ ] Unit test: malformed payload (missing field, wrong type) throws `WebhookProcessingError`
- [ ] Unit test: payload with extra unknown fields still passes validation (forward-compatible)
