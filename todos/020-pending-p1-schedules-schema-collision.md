---
status: pending
priority: p1
issue_id: "020"
tags: [code-review, data-integrity, schema, workspace-db]
dependencies: []
---

# P1: Schedules Table Schema Collision Between Heartbeat Script and workspace-schema.sql

## Problem Statement

`register-heartbeat-schedules.py` creates its own `schedules` table with `CREATE TABLE IF NOT EXISTS` using an incompatible schema (integer PK, `cron_expression`, `task_description`). The canonical schema in `workspace-schema.sql` uses text PK, `name TEXT NOT NULL UNIQUE`, `prompt TEXT NOT NULL`, `rrule TEXT`, `adapter_type`, `model`, `status`, `config`. If the heartbeat hook runs before `init-db.sh`, the wrong schema is created and all subsequent schedule operations fail with column-not-found errors.

Additionally, `init-db.sh` migration is missing the `config TEXT` column and `UNIQUE` constraint on `name` that exist in `workspace-schema.sql`.

## Findings

### Schema in register-heartbeat-schedules.py:133-145
```sql
CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_slug TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    task_description TEXT NOT NULL,
    source TEXT DEFAULT 'heartbeat',
    enabled INTEGER DEFAULT 1,
    UNIQUE(agent_slug, cron_expression, task_description)
)
```

### Canonical schema in workspace-schema.sql:817-834
```sql
CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    agent_slug TEXT NOT NULL,
    name TEXT NOT NULL UNIQUE,
    prompt TEXT NOT NULL,
    rrule TEXT,
    adapter_type TEXT CHECK(...),
    model TEXT,
    status TEXT CHECK(...),
    config TEXT,
    ...
)
```

### init-db.sh migration:78-94
- Missing `config TEXT` column
- Missing `UNIQUE` on `name`
- Missing CHECK constraints on `adapter_type` and `status`

## Proposed Solutions

### Option A: Rename heartbeat table (Recommended)
- Change `register-heartbeat-schedules.py` to use `heartbeat_schedules` table
- Keep canonical `schedules` table for the scheduler daemon
- Add migration step to detect and fix broken schemas
- Effort: Small | Risk: Low

### Option B: Convert heartbeat entries to canonical schema
- Rewrite heartbeat script to INSERT into canonical `schedules` format
- Generate `id TEXT`, `name`, `prompt`, `rrule` from heartbeat data
- Effort: Medium | Risk: Medium

## Acceptance Criteria
- [ ] Heartbeat registration cannot corrupt the canonical schedules table
- [ ] init-db.sh migration includes `config TEXT` column
- [ ] init-db.sh migration includes `UNIQUE` constraint on `name`
- [ ] Existing broken workspaces detected and fixed

## Work Log
- 2026-05-02: Identified by data-integrity-guardian
