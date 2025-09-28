/**
 * Credential Service - Secure API Key and OAuth Token Management
 * Simple, minimal implementation for Xerus startup
 */

const crypto = require('crypto');
const { neonDB } = require('../database/connections/neon');

class CredentialService {
  constructor() {
    // Simple encryption key derived from environment
    // In production, this should come from secure environment variable
    this.encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY || 'xerus-default-key-change-in-production';
    this.algorithm = 'aes-256-gcm';
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(text) {
    try {
      const iv = crypto.randomBytes(16);
      const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData) {
    try {
      const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
      
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Store OAuth tokens for a user and tool
   */
  async storeOAuthTokens(userId, toolName, tokens) {
    try {
      const { access_token, refresh_token, expires_at } = tokens;
      
      // Encrypt tokens
      const encryptedAccessToken = this.encrypt(access_token);
      const encryptedRefreshToken = refresh_token ? this.encrypt(refresh_token) : null;
      
      // Store in database
      await neonDB.query(`
        INSERT INTO user_credentials 
        (user_id, tool_name, encrypted_access_token, encrypted_refresh_token, token_expires_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, tool_name) 
        DO UPDATE SET
          encrypted_access_token = EXCLUDED.encrypted_access_token,
          encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
          token_expires_at = EXCLUDED.token_expires_at,
          updated_at = CURRENT_TIMESTAMP
      `, [
        userId,
        toolName,
        JSON.stringify(encryptedAccessToken),
        encryptedRefreshToken ? JSON.stringify(encryptedRefreshToken) : null,
        expires_at ? new Date(expires_at) : null
      ]);

      return true;
    } catch (error) {
      throw new Error(`Failed to store OAuth tokens: ${error.message}`);
    }
  }

  /**
   * Retrieve OAuth tokens for a user and tool
   */
  async getOAuthTokens(userId, toolName) {
    try {
      const result = await neonDB.query(`
        SELECT encrypted_access_token, encrypted_refresh_token, token_expires_at
        FROM user_credentials 
        WHERE user_id = $1 AND tool_name = $2
      `, [userId, toolName]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      
      // Decrypt tokens
      const accessTokenData = JSON.parse(row.encrypted_access_token);
      const accessToken = this.decrypt(accessTokenData);
      
      let refreshToken = null;
      if (row.encrypted_refresh_token) {
        const refreshTokenData = JSON.parse(row.encrypted_refresh_token);
        refreshToken = this.decrypt(refreshTokenData);
      }

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: row.token_expires_at
      };
    } catch (error) {
      throw new Error(`Failed to retrieve OAuth tokens: ${error.message}`);
    }
  }

  /**
   * Check if user has valid credentials for a tool
   */
  async hasValidCredentials(userId, toolName) {
    try {
      const tokens = await this.getOAuthTokens(userId, toolName);
      
      if (!tokens) {
        return false;
      }

      // Check if token is expired (with 5-minute buffer)
      if (tokens.expires_at) {
        const expiryTime = new Date(tokens.expires_at);
        const now = new Date();
        const buffer = 5 * 60 * 1000; // 5 minutes
        
        if (now.getTime() + buffer > expiryTime.getTime()) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error(`Error checking credentials: ${error.message}`);
      return false;
    }
  }

  /**
   * Delete credentials for a user and tool
   */
  async deleteCredentials(userId, toolName) {
    try {
      await neonDB.query(`
        DELETE FROM user_credentials 
        WHERE user_id = $1 AND tool_name = $2
      `, [userId, toolName]);

      return true;
    } catch (error) {
      throw new Error(`Failed to delete credentials: ${error.message}`);
    }
  }

  /**
   * List tools that user has credentials for
   */
  async getUserConfiguredTools(userId) {
    try {
      const result = await neonDB.query(`
        SELECT uc.tool_name, tc.display_name, uc.created_at, uc.token_expires_at
        FROM user_credentials uc
        JOIN tool_configurations tc ON uc.tool_name = tc.tool_name
        WHERE uc.user_id = $1
        ORDER BY uc.created_at DESC
      `, [userId]);

      return result.rows.map(row => ({
        tool_name: row.tool_name,
        display_name: row.display_name,
        configured_at: row.created_at,
        expires_at: row.token_expires_at
      }));
    } catch (error) {
      throw new Error(`Failed to get user configured tools: ${error.message}`);
    }
  }
}

module.exports = CredentialService;