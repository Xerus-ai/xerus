-- Migration: 064_fix_type_mismatches.sql
-- Description: Fix column type mismatches for channel references.
--   channels.id is UUID but inbox_items.channel_id is TEXT and
--   heartbeat_configs.default_channel_id is INTEGER.
-- Depends: 036_inbox_items.sql, 021_behaviour_config.sql

-- ===== 1. inbox_items.channel_id: TEXT -> UUID =====

ALTER TABLE inbox_items
    ALTER COLUMN channel_id TYPE UUID USING channel_id::uuid;

ALTER TABLE inbox_items
    ADD CONSTRAINT fk_inbox_items_channel
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL;

-- ===== 2. heartbeat_configs.default_channel_id: INTEGER -> UUID =====

ALTER TABLE heartbeat_configs
    ALTER COLUMN default_channel_id TYPE UUID USING NULL;

ALTER TABLE heartbeat_configs
    ADD CONSTRAINT fk_heartbeat_configs_channel
    FOREIGN KEY (default_channel_id) REFERENCES channels(id) ON DELETE SET NULL;

-- ===== 3. memory_search_index.channel_id: INTEGER -> UUID =====

ALTER TABLE memory_search_index
    ALTER COLUMN channel_id TYPE UUID USING NULL;

ALTER TABLE memory_search_index
    ADD CONSTRAINT fk_memory_search_index_channel
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL;
