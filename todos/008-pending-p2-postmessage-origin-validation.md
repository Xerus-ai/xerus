---
status: pending
priority: p2
issue_id: billing-polar-008
tags: [code-review, security, frontend]
---
# PostMessage Origin Validation Missing in PolarCheckoutOverlay

## Problem Statement
PolarCheckoutOverlay accepts postMessage events from ANY origin. Any malicious script running on the page (or in an iframe) can send `{ type: 'polar:checkout:success' }` to trigger the `onSuccess()` callback, potentially marking a checkout as successful without an actual payment completing. This is a cross-origin message spoofing vulnerability.

## Findings
File: `xerus_web/components/onboarding/cards/PolarCheckoutOverlay.tsx:26-39`

The `message` event listener processes `event.data` without checking `event.origin`, allowing any window or frame to forge checkout success/confirmation messages.

## Proposed Solutions
Add origin validation before processing the message event data:

```typescript
if (event.origin !== 'https://checkout.polar.sh') return;
```

This guard must be placed at the top of the message event handler, before any `event.data` checks are evaluated.

## Acceptance Criteria
- [ ] Only messages originating from Polar's checkout domain (`https://checkout.polar.sh`) trigger `onSuccess`
- [ ] Messages from any other origin are silently ignored
- [ ] Existing checkout flow continues to work correctly with the origin check in place
