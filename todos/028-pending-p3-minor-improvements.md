---
status: pending
priority: p3
issue_id: "028"
tags: [code-review, polish, minor]
dependencies: []
---

# P3: Minor Improvements and Polish

## Findings

1. **React key stability** — `inbox/[domain]/page.tsx:182`: Uses array index as key for sessions. Use `key={\`${s.agent_slug}-${s.started_at}\`}` instead.

2. **formatTimeAgo negative time** — `inbox/[domain]/page.tsx:222-229`: No guard for future dates (clock skew). Add `Math.max(0, diff)`.

3. **Handoff file retention** — `write-handoff.py`: Files accumulate indefinitely. Add retention (keep latest N per agent or delete older than N days).

4. **{{OBJECTIVE_1}} not substituted** — `workspace-scaffold.service.ts:58-63`: Variable not passed, persists as literal text in rendered CLAUDE.md.

5. **scaffold.json is dead config** — `.xerus/templates/scaffold.json` variable schema is never read by any code.

6. **{TODO:} in template strings** — `workspace-personalizer.service.ts:127-159`: User-facing placeholders use `{TODO:` syntax. Consider `[Your vision here]` to avoid confusing TODO scanners.

7. **S3 dedup hash logging** — `s3-backup.service.ts:143-155`: `getSnapshotHash` catch blocks return null without logging. Add debug log for flaky S3.

8. **Frontend response cast** — `useDomains.ts:37`, `inbox/[domain]/page.tsx:55`: `as` casts due to inconsistent SWR response wrapper. Standardize fetcher globally.

9. **ScaffoldVars interface** — `workspace-scaffold.service.ts:14-16`: Redundant with `Record<string, string>`. Use type alias.

10. **jq consolidation** — `scaffold-sync-hook.sh:88-93`: 6 sequential jq invocations on same file. Combine into single jq call.

11. **init-db.sh consolidation** — 9 sequential sqlite3 invocations. Combine into single heredoc.

12. **config.json model vs ai_model** — Perpetual normalization tax. Scaffold writes `model`, canonical interface defines `ai_model`.

## Work Log
- 2026-05-02: Identified by typescript-reviewer, performance-oracle, pattern-recognition-specialist, data-integrity-guardian
