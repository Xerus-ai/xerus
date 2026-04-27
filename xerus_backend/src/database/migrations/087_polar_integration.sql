BEGIN;

-- 1. Drop old plan constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_type_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_plan_type;

-- 2. Rename plan types
UPDATE users SET plan_type = 'pro' WHERE plan_type IN ('free', 'starter');
UPDATE users SET plan_type = 'max' WHERE plan_type = 'advanced';
UPDATE users SET plan_type = 'ultra' WHERE plan_type = 'prodigy';

-- 3. Add new constraint
ALTER TABLE users ALTER COLUMN plan_type SET NOT NULL;
ALTER TABLE users ALTER COLUMN plan_type SET DEFAULT 'pro';
ALTER TABLE users ALTER COLUMN credits_available SET DEFAULT 500;
ALTER TABLE users ADD CONSTRAINT users_plan_type_check
    CHECK (plan_type IN ('pro', 'max', 'ultra'));

-- 4. Add Polar columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS polar_customer_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS polar_subscription_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'pending'
    CHECK (subscription_status IN ('active', 'canceled', 'past_due', 'revoked', 'pending'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_email VARCHAR(255);

-- 5. Index for webhook lookups
CREATE INDEX IF NOT EXISTS idx_users_polar_customer_id ON users(polar_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_polar_subscription_id ON users(polar_subscription_id);

-- 6. Audit trail
INSERT INTO credit_transactions (user_id, amount, operation_type, reason, balance_after)
SELECT user_id, 0, 'reset', 'Migration 087: Plan rename + Polar integration', credits_available
FROM users;

COMMIT;
