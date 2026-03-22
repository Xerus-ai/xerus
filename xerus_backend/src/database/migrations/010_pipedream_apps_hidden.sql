-- Migration: 010_pipedream_apps_hidden.sql
-- Description: Add is_hidden column to filter apps from UI
-- Depends: 009_pipedream_apps_cache.sql

-- Add is_hidden column with default false (visible by default)
ALTER TABLE pipedream_apps
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false NOT NULL;

-- Index for filtering visible apps
CREATE INDEX IF NOT EXISTS idx_pipedream_apps_visible ON pipedream_apps(is_hidden) WHERE is_hidden = false;

COMMENT ON COLUMN pipedream_apps.is_hidden IS 'Hidden apps are not shown in UI but remain in database';
