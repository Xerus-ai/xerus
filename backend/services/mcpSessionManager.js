/**
 * MCP Session Manager - Persistent Session Storage
 * Handles MCP session persistence across page refreshes and server restarts
 * Supports multiple users and multiple MCP servers
 */

const { neonDB } = require('../database/connections/neon');

class MCPSessionManager {
  constructor() {
    this.initializeSchema();
  }

  /**
   * Initialize database schema
   */
  async initializeSchema() {
    try {
      // Read and execute the schema SQL
      const fs = require('fs');
      const path = require('path');
      const schemaPath = path.join(__dirname, '../database/schema/mcp_sessions.sql');
      
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await neonDB.query(schemaSql);
        console.log('🗃️ MCP Sessions table initialized');
      }
    } catch (error) {
      console.error('[ERROR] Failed to initialize MCP sessions schema:', error.message);
    }
  }

  /**
   * Store or update MCP session
   */
  async storeSession(userId, serverId, sessionData) {
    try {
      const {
        sessionId,
        serverUrl,
        authType,
        capabilities,
        expiresAt
      } = sessionData;

      const query = `
        INSERT INTO mcp_sessions (
          user_id, server_id, session_id, server_url, 
          auth_type, capabilities, expires_at, last_used_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, server_id)
        DO UPDATE SET
          session_id = EXCLUDED.session_id,
          server_url = EXCLUDED.server_url,
          auth_type = EXCLUDED.auth_type,
          capabilities = EXCLUDED.capabilities,
          expires_at = EXCLUDED.expires_at,
          last_used_at = CURRENT_TIMESTAMP,
          status = 'active',
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, session_id;
      `;

      const values = [
        userId || 'guest',
        serverId,
        sessionId,
        serverUrl,
        authType,
        JSON.stringify(capabilities),
        expiresAt || null
      ];

      const result = await neonDB.query(query, values);
      
      console.log(`💾 MCP session stored: ${serverId} for user ${userId} (${sessionId.substring(0, 8)}...)`);
      return result.rows[0];

    } catch (error) {
      console.error('[ERROR] Failed to store MCP session:', error.message);
      throw error;
    }
  }

  /**
   * Retrieve MCP session for user and server
   */
  async getSession(userId, serverId) {
    try {
      const query = `
        SELECT 
          id, user_id, server_id, session_id, server_url,
          auth_type, capabilities, status, expires_at,
          created_at, updated_at, last_used_at
        FROM mcp_sessions 
        WHERE user_id = $1 AND server_id = $2 AND status = 'active'
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        ORDER BY updated_at DESC
        LIMIT 1;
      `;

      const result = await neonDB.query(query, [userId || 'guest', serverId]);
      
      if (result.rows.length > 0) {
        const session = result.rows[0];
        
        // Update last used timestamp
        await this.updateLastUsed(userId, serverId);
        
        console.log(`[SEARCH] MCP session retrieved: ${serverId} for user ${userId} (${session.session_id.substring(0, 8)}...)`);
        return {
          sessionId: session.session_id,
          serverUrl: session.server_url,
          authType: session.auth_type,
          capabilities: session.capabilities ? JSON.parse(session.capabilities) : null,
          expiresAt: session.expires_at,
          createdAt: session.created_at,
          lastUsedAt: session.last_used_at
        };
      }

      console.log(`[SEARCH] No active MCP session found: ${serverId} for user ${userId}`);
      return null;

    } catch (error) {
      console.error('[ERROR] Failed to retrieve MCP session:', error.message);
      throw error;
    }
  }

  /**
   * Update last used timestamp for session
   */
  async updateLastUsed(userId, serverId) {
    try {
      const query = `
        UPDATE mcp_sessions 
        SET last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND server_id = $2 AND status = 'active';
      `;

      await neonDB.query(query, [userId || 'guest', serverId]);
    } catch (error) {
      console.error('[ERROR] Failed to update last used timestamp:', error.message);
    }
  }

  /**
   * Mark session as expired or invalid
   */
  async invalidateSession(userId, serverId, reason = 'expired') {
    try {
      const query = `
        UPDATE mcp_sessions 
        SET status = $3, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND server_id = $2;
      `;

      await neonDB.query(query, [userId || 'guest', serverId, reason]);
      console.log(`🚫 MCP session invalidated: ${serverId} for user ${userId} (reason: ${reason})`);

    } catch (error) {
      console.error('[ERROR] Failed to invalidate MCP session:', error.message);
      throw error;
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId) {
    try {
      const query = `
        SELECT 
          server_id, session_id, server_url, auth_type,
          capabilities, created_at, last_used_at, expires_at
        FROM mcp_sessions 
        WHERE user_id = $1 AND status = 'active'
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        ORDER BY last_used_at DESC;
      `;

      const result = await neonDB.query(query, [userId || 'guest']);
      
      return result.rows.map(row => ({
        serverId: row.server_id,
        sessionId: row.session_id,
        serverUrl: row.server_url,
        authType: row.auth_type,
        capabilities: row.capabilities ? JSON.parse(row.capabilities) : null,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        expiresAt: row.expires_at
      }));

    } catch (error) {
      console.error('[ERROR] Failed to get user sessions:', error.message);
      throw error;
    }
  }

  /**
   * Clean up expired sessions (should be called periodically)
   */
  async cleanupExpiredSessions() {
    try {
      const result = await neonDB.query('SELECT cleanup_expired_mcp_sessions() as deleted_count;');
      const deletedCount = result.rows[0].deleted_count;
      
      if (deletedCount > 0) {
        console.log(`[CLEAN] Cleaned up ${deletedCount} expired MCP sessions`);
      }
      
      return deletedCount;
    } catch (error) {
      console.error('[ERROR] Failed to cleanup expired sessions:', error.message);
      throw error;
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats() {
    try {
      const query = `
        SELECT 
          server_id,
          COUNT(*) as total_sessions,
          COUNT(*) FILTER (WHERE status = 'active') as active_sessions,
          COUNT(*) FILTER (WHERE last_used_at > CURRENT_TIMESTAMP - INTERVAL '1 hour') as recent_sessions,
          MAX(last_used_at) as last_activity
        FROM mcp_sessions
        GROUP BY server_id
        ORDER BY active_sessions DESC;
      `;

      const result = await neonDB.query(query);
      return result.rows;
    } catch (error) {
      console.error('[ERROR] Failed to get session stats:', error.message);
      throw error;
    }
  }
}

// Export singleton instance
const mcpSessionManager = new MCPSessionManager();

// Start periodic cleanup (every hour)
setInterval(() => {
  mcpSessionManager.cleanupExpiredSessions().catch(console.error);
}, 60 * 60 * 1000);

console.log('💾 MCP Session Manager initialized with persistent storage');

module.exports = mcpSessionManager;