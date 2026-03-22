-- Users table for Xerus backend
-- Creates user management schema with credits system

CREATE TABLE IF NOT EXISTS users (
  user_id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  plan_type VARCHAR(50) NOT NULL DEFAULT 'free',
  credits_available INTEGER NOT NULL DEFAULT 10,
  credits_used INTEGER NOT NULL DEFAULT 0,
  credits_reset_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  avatar_url TEXT,
  timezone VARCHAR(50) DEFAULT 'UTC',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_plan_type ON users(plan_type);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_credits_reset_date ON users(credits_reset_date);

-- Check constraints
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_plan_type;
ALTER TABLE users ADD CONSTRAINT chk_plan_type CHECK (plan_type IN ('free', 'pro', 'enterprise'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_role;
ALTER TABLE users ADD CONSTRAINT chk_role CHECK (role IN ('admin', 'user'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_credits_available;
ALTER TABLE users ADD CONSTRAINT chk_credits_available CHECK (credits_available >= 0);

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_credits_used;
ALTER TABLE users ADD CONSTRAINT chk_credits_used CHECK (credits_used >= 0);

-- No credits_reserved column in clean schema
