---
status: pending
priority: p1
issue_id: "023"
tags: [code-review, safety, correctness]
dependencies: []
---

# P1: Destructive Operations Without Safety Guards

## Problem Statement

Two safety issues: (1) `session-start.sh` runs `rm -rf .claude/skills/` even when the preceding `cp` fails, permanently destroying skill files. (2) `sandbox-setup.ts` downgraded scheduler startup from `throw` to `log.warn + return`, meaning sandboxes report healthy but silently have no scheduler.

## Findings

### 1. session-start.sh:68-70 — rm -rf after failed cp
```bash
cp -r "$CLAUDE_SKILLS_DIR"/* "$AGENT_SKILLS_DIR/" 2>/dev/null || true
rm -rf "$CLAUDE_SKILLS_DIR"          # RUNS EVEN IF CP FAILED
ln -s "../.agent/skills" "$CLAUDE_SKILLS_DIR" 2>/dev/null || true
```
If cp fails (disk full, permissions, I/O error), skills are destroyed. Also `cp src/*` misses dotfiles.

**Fix:**
```bash
if cp -r "$CLAUDE_SKILLS_DIR"/. "$AGENT_SKILLS_DIR/" 2>/dev/null; then
    rm -rf "$CLAUDE_SKILLS_DIR"
    ln -s "../.agent/skills" "$CLAUDE_SKILLS_DIR" 2>/dev/null || true
fi
```

### 2. sandbox-setup.ts:391-393, 408-410 — scheduler throw → warn
```typescript
// Was: throw new Error(`Bun runtime not found...`);
// Now: log.warn('Bun not found, scheduler skipped', ...); return;
```
Scheduler powers agent heartbeats/cron. Silent skip means scheduled agent executions silently stop.

**Fix:** Restore `throw` for scheduler startup failure, or at minimum set a workspace health status flag that surfaces the degraded state to users/agents.

### 3. dispatchCrossChannelCoordination:655 — silent return on missing deps
```typescript
if (!deps.messageBridge || !ctx.sandboxId) return;  // Should throw like handleAgentMessage
```

## Acceptance Criteria
- [ ] `rm -rf` only runs after successful cp
- [ ] cp uses `src/.` to include dotfiles
- [ ] Scheduler failure either throws or surfaces degraded state
- [ ] dispatchCrossChannelCoordination fails fast on missing deps

## Work Log
- 2026-05-02: Identified by code-reviewer, typescript-reviewer, claude-md-compliance-checker
