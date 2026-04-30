---
status: pending
priority: p2
issue_id: billing-polar-015
tags: [code-review, migration, data-integrity]
---
# Migration 090 Lacks Idempotency and Transaction Documentation

## Problem Statement
Migration `090_execution_session_indexes.sql` uses `CREATE INDEX CONCURRENTLY` without `IF NOT EXISTS`. If the migration partially applies (e.g., first index succeeds, second fails), it cannot be safely re-run because the first CREATE will error on the already-existing index. Additionally, `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block, which needs to be documented for the migration runner.

## Findings
File: `090_execution_session_indexes.sql`

Both `CREATE INDEX CONCURRENTLY` statements lack the `IF NOT EXISTS` clause, making the migration non-idempotent. There is no documentation about the non-transactional requirement of concurrent index creation.

## Proposed Solutions
1. Add `IF NOT EXISTS` to both `CREATE INDEX CONCURRENTLY` statements:
   ```sql
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_name ON table_name(...);
   ```
2. Add a comment at the top of the migration file explaining that it cannot run inside a transaction block:
   ```sql
   -- NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
   -- Ensure the migration runner executes this file outside of BEGIN/COMMIT.
   ```

## Acceptance Criteria
- [ ] Both CREATE INDEX statements include `IF NOT EXISTS`
- [ ] Migration can be safely re-run after partial failure
- [ ] Migration file includes documentation comment about non-transactional requirement
- [ ] Migration runner documentation updated if applicable
