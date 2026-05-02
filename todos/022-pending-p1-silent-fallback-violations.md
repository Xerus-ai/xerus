---
status: pending
priority: p1
issue_id: "022"
tags: [code-review, claude-md-compliance, fail-fast]
dependencies: []
---

# P1: Pervasive Silent Fallback / Catch-All Violations

## Problem Statement

CLAUDE.md Absolute Rule: "NO fallbacks -- `catch { return default }` is banned. Throw error, let caller handle." Multiple files in this commit introduce bare `catch {}` blocks or `.catch(() => {})` patterns that swallow ALL errors, not just the expected ones.

## Findings (13 instances across 7 files)

### Bare catch {} blocks (swallow all errors):
1. `agent-config-resolver.ts:40` — catches all errors when reading agent.yaml, not just file-not-found
2. `agent-config-resolver.ts:92` — `tryRead()` catches all errors
3. `workspace-scaffold.service.ts:21` — `tryReadTemplate` catches all errors
4. `workspace-scaffold.service.ts:43` — `writeIfMissing` uses catch-for-control-flow
5. `company-workspace-db.service.ts:356` — execution_sessions query catch
6. `company-workspace-db.service.ts:365` — v_daily_costs query catch
7. `company.routes.ts:343` — CLAUDE.md readFile catch
8. `onboarding.routes.ts:167` — conversation creation catch
9. `s3-backup.service.ts:145,153` — getSnapshotHash double catch

### Fire-and-forget .catch(err => log.warn):
10. `company.routes.ts:176` — scaffoldProject failure
11. `company.routes.ts:181` — scaffoldChannel failure

### .catch(() => {}) with no logging:
12. `agent-filesystem.repository.ts:155` — putAgentConfig
13. `register-heartbeat-schedules.py:169` — `except sqlite3.Error: continue`

## Proposed Solutions

### Pattern to apply everywhere:
```typescript
// BAD:
try { ... } catch { return default; }

// GOOD: Check for specific expected error
try { ... } catch (err) {
    if (isFileNotFoundError(err)) return null;
    throw err;
}
```

- Use `isFileNotFoundError()` (already exists in agent-filesystem.repository.ts:10-13) for file reads
- Check for "no such table" for optional table queries
- Always re-throw unexpected errors
- At minimum add `log.warn()` before swallowing

## Acceptance Criteria
- [ ] All catch blocks discriminate between expected and unexpected errors
- [ ] Unexpected errors propagate (fail-fast)
- [ ] Expected errors are logged at warn/debug level
- [ ] No bare `catch {}` blocks remain in new code

## Work Log
- 2026-05-02: Identified by claude-md-compliance-checker, typescript-reviewer, architecture-strategist
