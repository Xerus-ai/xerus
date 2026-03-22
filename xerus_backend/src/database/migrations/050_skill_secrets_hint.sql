-- Add pre-computed hint column to skill_secrets
-- Avoids decrypting secrets on every status poll
ALTER TABLE skill_secrets ADD COLUMN IF NOT EXISTS hint TEXT NOT NULL DEFAULT '********';
