-- User Credentials Table for OAuth and API Keys
-- Migration 005: Create user_credentials table for secure credential storage

CREATE TABLE IF NOT EXISTS user_credentials (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    tool_name VARCHAR(100) NOT NULL,
    encrypted_access_token TEXT,
    encrypted_refresh_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    api_key_encrypted TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint to prevent duplicate credentials per user/tool
    UNIQUE(user_id, tool_name)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_credentials_user_id ON user_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_user_credentials_tool_name ON user_credentials(tool_name);

-- Comments for documentation
COMMENT ON TABLE user_credentials IS 'Stores encrypted OAuth tokens and API keys for users';
COMMENT ON COLUMN user_credentials.user_id IS 'Firebase user ID or development user ID';
COMMENT ON COLUMN user_credentials.tool_name IS 'Name of the tool/service (e.g., atlassian-remote, slack, notion)';
COMMENT ON COLUMN user_credentials.encrypted_access_token IS 'Encrypted OAuth access token';
COMMENT ON COLUMN user_credentials.encrypted_refresh_token IS 'Encrypted OAuth refresh token';
COMMENT ON COLUMN user_credentials.api_key_encrypted IS 'Encrypted API key for services that use API keys';