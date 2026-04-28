---
status: pending
priority: p2
issue_id: billing-polar-013
tags: [code-review, frontend, duplication]
---
# easeOutQuart Constant Duplicated Across 4 Files

## Problem Statement
The `easeOutQuart` easing constant is defined in 4 separate places. The canonical definition lives in `lib/motion.ts:4`, but three onboarding component files define their own local copies. This violates DRY and risks divergence if the easing curve is ever updated.

## Findings
- Canonical: `lib/motion.ts:4` — the single source of truth
- Duplicate: `PlanSelectionCard.tsx:34` — local `easeOutQuart` constant
- Duplicate: `ActivateWorkforceCard.tsx:15` — local `easeOutQuart` constant
- Duplicate: `ThinkingVerbs.tsx:16` — local `easeOutQuart` constant

## Proposed Solutions
Replace all local constant definitions with an import from the canonical location:

```typescript
import { easeOutQuart } from '@/lib/motion';
```

Remove the local constant definitions in each of the three files.

## Acceptance Criteria
- [ ] Single source of truth for `easeOutQuart` in `lib/motion.ts`
- [ ] `PlanSelectionCard.tsx` imports from `@/lib/motion`
- [ ] `ActivateWorkforceCard.tsx` imports from `@/lib/motion`
- [ ] `ThinkingVerbs.tsx` imports from `@/lib/motion`
- [ ] No local `easeOutQuart` definitions remain outside `lib/motion.ts`
