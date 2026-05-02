---
status: pending
priority: p2
issue_id: "025"
tags: [code-review, security, defense-in-depth]
dependencies: []
---

# P2: Missing Slug Validation and Path Injection Gaps

## Problem Statement

URL parameters (`domainId`, `channelId`) flow directly to SQL queries protected only by `escapeSQL()`. No slug format validation at the route level. Additionally, `_lib.sh` interpolates paths into Python source code instead of passing as arguments.

## Findings

### 1. company.routes.ts — No slug validation on URL params
Lines 215, 293, 333, 389, 464, 553: `req.params.domainId` and `req.params.channelId` passed to DB functions without `sanitizeSlug()` or `validateSlug()`. `sanitizeSlug()` already exists at `src/shared/slugify.ts:23`.

### 2. _lib.sh:70-87 — Python code injection via path interpolation
```bash
primary_channel=$($PYTHON -c "
import json, sys
try:
    with open('$config_file') as f:
```
If `$config_file` or `$XERUS_WORKSPACE_ROOT` contains a single quote, breaks out of Python string literal.

### 3. runner-event-router.ts:432-434, 470-472 — agentSlug in SQL without escapeSQL
```typescript
`UPDATE agents SET status = 'running' WHERE slug = '${agentSlug}'`
```
Agent slug comes from runner events (trust boundary). Should use `escapeSQL`.

### 4. Unsafe type assertion: runner-event-router.ts:633
```typescript
const targetAgent = metadata?.target_agent as string | undefined;
// Should be: typeof metadata?.target_agent === 'string' ? metadata.target_agent : undefined
```

## Proposed Solutions

1. Add `sanitizeSlug()` to all route parameter reads
2. Pass paths as `sys.argv` in _lib.sh Python calls
3. Use `escapeSQL()` for agent slugs in runner-event-router
4. Add type guard for target_agent metadata

## Acceptance Criteria
- [ ] All URL params validated before DB/filesystem use
- [ ] No string interpolation into Python source code
- [ ] All SQL values use escapeSQL or parameterized queries
- [ ] Type guards on untrusted metadata fields

## Work Log
- 2026-05-02: Identified by security-sentinel, typescript-reviewer
