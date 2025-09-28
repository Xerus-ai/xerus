-- MCP Sessions Table
-- Stores persistent session information for MCP server connections
-- Ensures sessions survive page refreshes and server restarts

CREATE TABLE IF NOT EXISTS mcp_sessions (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL, -- Firebase UID or 'guest' for guest users
    server_id VARCHAR(100) NOT NULL, -- MCP server identifier (e.g., 'atlassian-remote')
    session_id VARCHAR(500) NOT NULL, -- Session ID from MCP server
    server_url VARCHAR(500) NOT NULL, -- MCP server URL
    auth_type VARCHAR(50) NOT NULL, -- oauth, api_key, bearer, basic
    capabilities JSONB, -- Store server capabilities as JSON
    status VARCHAR(50) DEFAULT 'active', -- active, expired, error
    expires_at TIMESTAMP, -- When session expires (if known)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one active session per user per server
    UNIQUE(user_id, server_id),
    
    -- Indexes for performance
    INDEX idx_mcp_sessions_user_server (user_id, server_id),
    INDEX idx_mcp_sessions_status (status),
    INDEX idx_mcp_sessions_expires (expires_at)
);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_mcp_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_mcp_sessions_updated_at 
    BEFORE UPDATE ON mcp_sessions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_mcp_sessions_updated_at();

-- Clean up expired sessions (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_mcp_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM mcp_sessions 
    WHERE expires_at IS NOT NULL 
    AND expires_at < CURRENT_TIMESTAMP;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ language 'plpgsql';