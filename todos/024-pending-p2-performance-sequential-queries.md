---
status: pending
priority: p2
issue_id: "024"
tags: [code-review, performance, n-plus-1]
dependencies: []
---

# P2: Sequential Cross-Sandbox Queries and Blocking Polls

## Problem Statement

Three performance bottlenecks on hot paths:

1. `getProjectOverview()` runs 5 sequential SQL queries via Daytona `executeCommand` — each is a network round-trip (50-150ms). Total: 250-750ms when 4 queries could run in parallel.

2. `startSchedulerDaemon()` has a 10-second blocking poll loop (`sleep 2 * 5 iterations`) on every sandbox resume.

3. `personalizeWorkspace()` runs ~15 filesystem operations on every resume (not "2 exists() checks" as the comment says).

## Findings

### company-workspace-db.service.ts:314-370
Queries 2-5 all depend only on `domainSlug` — run with `Promise.all` after domain guard.

### sandbox-setup.ts:396-413
Poll loop blocks for up to 10s. On already-running scheduler, earlier PID check handles it. But killed schedulers trigger full 10s poll on every resume.

### workspace-health.ts:85-87
Calls `personalizeWorkspace()` unconditionally. The function does ~15 filesystem ops (settings.json read/write, memory dir creation, drive seed checks). Should be gated behind health check result or sentinel file.

## Proposed Solutions

1. `Promise.all` for getProjectOverview queries 2-5 (4x latency improvement)
2. Reduce scheduler poll to 3x1s or fire-and-forget
3. Gate personalizeWorkspace behind `drive/.seeded` sentinel file

## Acceptance Criteria
- [ ] getProjectOverview under 200ms for typical workspace
- [ ] Scheduler startup does not block resume for >3s
- [ ] Healthy resume skips redundant filesystem operations

## Work Log
- 2026-05-02: Identified by performance-oracle
