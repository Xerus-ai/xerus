-- Enforce one-to-one mapping between users and Polar entities
-- Partial unique indexes allow multiple NULLs (users without Polar accounts)

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_users_polar_customer_id_unique
    ON users(polar_customer_id) WHERE polar_customer_id IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_users_polar_subscription_id_unique
    ON users(polar_subscription_id) WHERE polar_subscription_id IS NOT NULL;
