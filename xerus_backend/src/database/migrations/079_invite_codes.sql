-- Migration 079: Invite codes for gated access
-- Temporary feature controlled by INVITE_ONLY_MODE env var

CREATE TABLE IF NOT EXISTS invite_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    created_by VARCHAR(255) NOT NULL REFERENCES users(user_id),
    used_by VARCHAR(255) REFERENCES users(user_id),
    used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_used BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE invite_codes IS 'Single-use invite codes for gated access. Controlled by INVITE_ONLY_MODE env var.';
COMMENT ON COLUMN invite_codes.code IS 'Plaintext alphanumeric code (8 chars, uppercase, ambiguity-free charset)';
COMMENT ON COLUMN invite_codes.created_by IS 'Admin user who generated this code';
COMMENT ON COLUMN invite_codes.used_by IS 'User who redeemed this code (NULL if unused)';
COMMENT ON COLUMN invite_codes.expires_at IS 'Optional expiry timestamp (NULL = no expiry)';

CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);
CREATE INDEX IF NOT EXISTS idx_invite_codes_unused ON invite_codes(is_used) WHERE NOT is_used;
CREATE INDEX IF NOT EXISTS idx_invite_codes_created_by ON invite_codes(created_by);
