-- Migration 007: Add guest user support and credit system to existing users table
-- This migration extends the existing users table to support guest users and credit-based system
-- Uses ALTER TABLE to preserve existing data and functionality

-- Add guest session token column (NULL for authenticated users, unique for guests)
ALTER TABLE users ADD COLUMN IF NOT EXISTS guest_session_token VARCHAR(128) UNIQUE;

-- Add user type column to distinguish between guest, authenticated, and admin users
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type VARCHAR(20) NOT NULL DEFAULT 'authenticated' 
    CHECK (user_type IN ('guest', 'authenticated', 'admin'));

-- Add credit system columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_available INTEGER NOT NULL DEFAULT 50; -- 50 for authenticated, 10 for guests
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_reset_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_type VARCHAR(20) DEFAULT 'free' 
    CHECK (plan_type IN ('free', 'pro', 'enterprise'));

-- Add guest session management columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMP WITH TIME ZONE; -- NULL for authenticated users
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Add metadata column if not exists (extend existing preferences)
ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Make email nullable to support guest users (guests don't have email)
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_users_guest_session ON users(guest_session_token);
CREATE INDEX IF NOT EXISTS idx_users_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_users_last_activity ON users(last_activity);
CREATE INDEX IF NOT EXISTS idx_users_session_expires ON users(session_expires_at);
CREATE INDEX IF NOT EXISTS idx_users_credits ON users(credits_available, user_type);

-- Add constraint to ensure user identity integrity
-- Either authenticated user (has email, no guest token) OR guest user (no email, has guest token)
ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS check_user_identity 
    CHECK (
        (user_type = 'authenticated' AND email IS NOT NULL AND guest_session_token IS NULL) OR 
        (user_type = 'guest' AND email IS NULL AND guest_session_token IS NOT NULL) OR
        (user_type = 'admin' AND email IS NOT NULL AND guest_session_token IS NULL)
    );

-- Create unified guest_sessions table for session management
CREATE TABLE IF NOT EXISTS guest_sessions (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(128) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Session metadata
    ip_address INET,
    user_agent TEXT,
    device_fingerprint TEXT,
    
    -- CSRF protection
    csrf_token VARCHAR(64),
    
    -- Session data
    session_data JSONB DEFAULT '{}'
);

-- Create indexes for guest sessions
CREATE INDEX IF NOT EXISTS idx_guest_sessions_user_id ON guest_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_token ON guest_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_expires ON guest_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_active ON guest_sessions(is_active, last_activity);

-- Create unified user_preferences table (if not already exists from other system)
CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    preference_key VARCHAR(100) NOT NULL,
    preference_value JSONB NOT NULL,
    preference_type VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (preference_type IN ('user', 'system', 'app')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint for user preferences
    UNIQUE(user_id, preference_key)
);

-- Create indexes for user preferences
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_key ON user_preferences(preference_key);
CREATE INDEX IF NOT EXISTS idx_user_preferences_type ON user_preferences(preference_type);

-- Update existing users to set default credit amounts for authenticated users
UPDATE users 
SET credits_available = 50, user_type = 'authenticated' 
WHERE user_type = 'authenticated' AND credits_available IS NULL;

-- Create function to auto-update last_activity and timestamps
CREATE OR REPLACE FUNCTION update_user_activity()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    IF OLD.last_activity IS DISTINCT FROM NEW.last_activity THEN
        NEW.last_activity = CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for auto-updating user activity
DROP TRIGGER IF EXISTS update_users_activity ON users;
CREATE TRIGGER update_users_activity 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_user_activity();

-- Create trigger for user_preferences updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;
CREATE TRIGGER update_user_preferences_updated_at 
    BEFORE UPDATE ON user_preferences 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON COLUMN users.guest_session_token IS 'Session token for guest users, NULL for authenticated users';
COMMENT ON COLUMN users.user_type IS 'User type: guest (10 credits), authenticated (50 credits), or admin (unlimited)';
COMMENT ON COLUMN users.credits_available IS 'Available credits: 10 for guests, 50 for authenticated users';
COMMENT ON COLUMN users.session_expires_at IS 'Session expiration for guest users, NULL for authenticated';
COMMENT ON COLUMN users.last_activity IS 'Last user activity timestamp for session management';

COMMENT ON TABLE guest_sessions IS 'Session management for guest users with CSRF protection';
COMMENT ON TABLE user_preferences IS 'User preferences supporting both guest and authenticated users';

-- Success message
SELECT 'Migration 007: Successfully added guest user support and credit system to existing users table' as migration_status;