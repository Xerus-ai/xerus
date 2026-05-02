---
status: pending
priority: p1
issue_id: "021"
tags: [code-review, data-integrity, correctness]
dependencies: []
---

# P1: getProjectOverview Wrong Column Name + Silent Fallbacks

## Problem Statement

Two bugs in `getProjectOverview()`:

1. **Wrong column name**: Queries `es.completed_at` but the `execution_sessions` table uses `ended_at`. SQLite silently returns null for non-existent columns, so all sessions appear to have no completion time.

2. **Silent fallback catch blocks**: Two bare `catch {}` blocks return default values (`[]` and `{ total_cost: 0, session_count: 0 }`) for ANY error, violating CLAUDE.md's no-fallback rule.

## Findings

### Bug 1: company-workspace-db.service.ts:349
```typescript
SELECT es.agent_slug, es.status, es.started_at, es.completed_at  // WRONG
// Should be: es.ended_at AS completed_at
```

### Bug 2: company-workspace-db.service.ts:356-358, 364-367
```typescript
} catch {
    // execution_sessions may not exist in all workspaces
}
```
Masks all errors (network, malformed SQL, sandbox timeout) — not just missing tables.

### Additional: company.routes.ts:343
```typescript
} catch {
    // CLAUDE.md may not exist yet
}
```
Same pattern — should check for file-not-found specifically.

## Proposed Solutions

1. Fix column name: `es.ended_at AS completed_at`
2. Narrow catch blocks to specific error patterns (table-not-found, file-not-found)
3. Re-throw unexpected errors
4. Add `log.warn()` for caught expected errors

## Acceptance Criteria
- [ ] `completed_at` field returns actual completion timestamps
- [ ] Catch blocks only suppress known expected errors
- [ ] Unexpected errors propagate to caller
- [ ] Overview endpoint tested with both present and missing tables

## Work Log
- 2026-05-02: Identified by data-integrity-guardian, claude-md-compliance-checker
