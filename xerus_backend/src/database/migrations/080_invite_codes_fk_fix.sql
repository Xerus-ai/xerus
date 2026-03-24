-- Migration 080: Fix invite_codes FK constraints and remove redundant index
-- Adds ON DELETE behavior and drops redundant index (UNIQUE already creates one)

-- Drop and re-add created_by FK with ON DELETE RESTRICT (preserve audit trail)
ALTER TABLE invite_codes DROP CONSTRAINT IF EXISTS invite_codes_created_by_fkey;
ALTER TABLE invite_codes ADD CONSTRAINT invite_codes_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT;

-- Drop and re-add used_by FK with ON DELETE SET NULL (code was already used)
ALTER TABLE invite_codes DROP CONSTRAINT IF EXISTS invite_codes_used_by_fkey;
ALTER TABLE invite_codes ADD CONSTRAINT invite_codes_used_by_fkey
    FOREIGN KEY (used_by) REFERENCES users(user_id) ON DELETE SET NULL;

-- Drop redundant index — UNIQUE constraint on code already creates an index
DROP INDEX IF EXISTS idx_invite_codes_code;
