-- Ensure credits_available cannot go negative at the database level.
-- This constraint was originally added in 001_users.sql but is re-affirmed
-- here as a safety net for the atomic hold/refund credit pattern introduced
-- in the credit-deduction service race condition fix.
--
-- The CHECK constraint acts as a last line of defense: even if application
-- code has a bug, PostgreSQL will reject any UPDATE that would set
-- credits_available below zero, preventing double-spend.

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_credits_available;
ALTER TABLE users ADD CONSTRAINT chk_credits_available CHECK (credits_available >= 0);
