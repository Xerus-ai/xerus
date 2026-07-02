-- Migration: 095_sandbox_wake_schedule.sql
-- Alarm clock table: one row per sandbox with the earliest due schedule time.
-- The wake-daemon scans this table (indexed on next_wake_at) to wake sleeping
-- sandboxes before their schedules are due.

CREATE TABLE IF NOT EXISTS sandbox_wake_schedule (
    sandbox_id   TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    next_wake_at TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sandbox_wake_next ON sandbox_wake_schedule (next_wake_at)
    WHERE next_wake_at IS NOT NULL;
