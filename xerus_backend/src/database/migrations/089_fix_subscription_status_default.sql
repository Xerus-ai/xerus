BEGIN;

-- Fix: Existing users without Polar subscriptions should be 'pending', not 'active'
-- Migration 087 incorrectly defaulted subscription_status to 'active' for all existing users.
-- Users who have actually paid through Polar will have a polar_subscription_id set.
-- Users without a polar_subscription_id never paid and should be 'pending'.
UPDATE users
SET subscription_status = 'pending'
WHERE polar_subscription_id IS NULL
  AND subscription_status = 'active';

-- Change the column default for future inserts to 'pending'
ALTER TABLE users ALTER COLUMN subscription_status SET DEFAULT 'pending';

-- Audit trail
INSERT INTO credit_transactions (user_id, amount, operation_type, reason, balance_after)
SELECT user_id, 0, 'reset', 'Migration 089: Fix subscription_status default to pending', credits_available
FROM users
WHERE polar_subscription_id IS NULL;

COMMIT;
