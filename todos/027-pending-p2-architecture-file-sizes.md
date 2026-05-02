---
status: pending
priority: p2
issue_id: "027"
tags: [code-review, architecture, file-size, circular-deps]
dependencies: []
---

# P2: File Size Violations and Circular Dependencies

## Problem Statement

Three files exceed the 400-line limit (pre-existing but worsened by this commit). Bidirectional import between company and execution domains.

## Findings

### Files over 400 lines:
1. `runner-event-router.ts` — 868 lines (2x limit). Extract: CLI stream handlers → `cli-stream-router.ts`, coordination logic → `coordination-router.ts`
2. `company.routes.ts` — 719 lines (1.8x limit). Extract: overview endpoint → `company-overview.routes.ts`, agent dispatch → `channel-agent-resolver.service.ts`
3. `sandbox-setup.ts` — 414 lines (marginally over). Extract: `startSchedulerDaemon` + `runDatabaseMigrations` → `sandbox-lifecycle.ts`

### Circular dependency:
- `execution.service.ts` imports from `company/company-workspace-db.service` and `company/channel-execution.service`
- `company/channel-execution.service.ts` imports from `execution/execution.service` and `execution/streaming/stream.handler`

### Misplaced service:
- `workspace-scaffold.service.ts` in `company/` depends on `sandbox-infra` types. Should live alongside `scaffold-payload.service.ts` in `sandbox-infra/scaffold/`.

## Proposed Solutions

1. Extract modules as described above to bring files under 400 lines
2. Move shared messaging functions to `src/domains/messaging/` or `src/shared/`
3. Move `workspace-scaffold.service.ts` to `sandbox-infra/scaffold/`

## Acceptance Criteria
- [ ] All files under 400 lines
- [ ] No bidirectional domain imports
- [ ] Scaffold services co-located in sandbox-infra

## Work Log
- 2026-05-02: Identified by architecture-strategist, typescript-reviewer, claude-md-compliance-checker
