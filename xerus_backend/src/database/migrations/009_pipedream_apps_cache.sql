-- Migration: 009_pipedream_apps_cache.sql
-- Description: Pipedream apps caching with search and pagination support
-- Depends: 008_tools_pipedream.sql
-- Phase 1: Create pipedream_apps table with sync mechanism
-- Phase 2: Add efficient search indexes and pagination support

-- ===== PIPEDREAM_APPS TABLE =====
-- Caches Pipedream apps list for fast search and pagination
-- Synced periodically via background job

CREATE TABLE IF NOT EXISTS pipedream_apps (
    id SERIAL PRIMARY KEY,
    name_slug VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    auth_type VARCHAR(50),
    img_src VARCHAR(500),
    categories TEXT[],
    featured BOOLEAN DEFAULT false,
    featured_weight INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    CONSTRAINT pipedream_apps_name_slug_check CHECK (name_slug ~ '^[a-z0-9_-]+$')
);

-- ===== INDEXES FOR EFFICIENT SEARCH =====

-- B-tree index for exact lookups
CREATE INDEX IF NOT EXISTS idx_pipedream_apps_name_slug ON pipedream_apps(name_slug);

-- B-tree index for featured apps
CREATE INDEX IF NOT EXISTS idx_pipedream_apps_featured ON pipedream_apps(featured) WHERE featured = true;

-- GIN index for full-text search on name and description
CREATE INDEX IF NOT EXISTS idx_pipedream_apps_search ON pipedream_apps
USING GIN (to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(description, '')));

-- GIN index for category filtering
CREATE INDEX IF NOT EXISTS idx_pipedream_apps_categories ON pipedream_apps
USING GIN (categories);

-- Composite index for stable pagination with featured priority and tiebreakers
CREATE INDEX IF NOT EXISTS idx_pipedream_apps_pagination ON pipedream_apps(featured DESC, featured_weight DESC NULLS LAST, name ASC, id ASC);

COMMENT ON TABLE pipedream_apps IS 'Cached Pipedream apps for fast search and pagination';
COMMENT ON COLUMN pipedream_apps.name_slug IS 'Unique app identifier (e.g., gmail, slack)';
COMMENT ON COLUMN pipedream_apps.categories IS 'Array of category tags for filtering';
COMMENT ON COLUMN pipedream_apps.featured IS 'Featured apps shown first in listings';
COMMENT ON COLUMN pipedream_apps.featured_weight IS 'Weight for sorting featured apps';

-- ===== SYNC METADATA TABLE =====
-- Tracks last successful sync for cache validation

CREATE TABLE IF NOT EXISTS pipedream_apps_sync (
    id INTEGER PRIMARY KEY DEFAULT 1,
    last_sync_at TIMESTAMPTZ,
    total_apps INTEGER DEFAULT 0,
    sync_status VARCHAR(20) DEFAULT 'pending',
    error TEXT,

    CONSTRAINT single_row CHECK (id = 1)
);

-- Initialize sync record
INSERT INTO pipedream_apps_sync (id, sync_status)
VALUES (1, 'pending')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE pipedream_apps_sync IS 'Metadata for Pipedream apps sync process';
COMMENT ON COLUMN pipedream_apps_sync.sync_status IS 'Status: pending, syncing, success, failed';
