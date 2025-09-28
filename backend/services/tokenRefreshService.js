/**
 * Token Refresh Service - Automated OAuth Token Management
 * Automatically refreshes OAuth tokens that are close to expiry
 */

const cron = require('node-cron');
const { neonDB } = require('../database/connections/neon');
const GenericOAuthService = require('./oauth/genericOAuthService');
const CredentialService = require('./credentialService');

class TokenRefreshService {
  constructor() {
    this.oauthService = new GenericOAuthService();
    this.credentialService = new CredentialService();
    this.isRunning = false;
    this.cronJob = null;
    
    // Configuration
    this.config = {
      // Refresh tokens that expire within 24 hours
      refreshThresholdHours: 24,
      // Run every hour
      cronSchedule: '0 * * * *',
      // Maximum number of tokens to refresh per run
      maxTokensPerRun: 10,
      // Enable detailed logging
      enableLogging: process.env.NODE_ENV === 'development'
    };
  }

  /**
   * Start the token refresh service
   */
  start() {
    if (this.isRunning) {
      console.log('[LOADING] Token refresh service is already running');
      return;
    }

    console.log('[START] Starting token refresh service...');
    console.log(`[TIME] Schedule: ${this.config.cronSchedule} (every hour)`);
    console.log(`[WARNING]  Refresh threshold: ${this.config.refreshThresholdHours} hours`);

    this.cronJob = cron.schedule(this.config.cronSchedule, async () => {
      await this.refreshExpiredTokens();
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    this.isRunning = true;
    console.log('[OK] Token refresh service started successfully');

    // Run initial check
    setTimeout(() => {
      this.refreshExpiredTokens();
    }, 5000); // Wait 5 seconds after startup
  }

  /**
   * Stop the token refresh service
   */
  stop() {
    if (!this.isRunning) {
      console.log('[LOADING] Token refresh service is not running');
      return;
    }

    console.log('🛑 Stopping token refresh service...');
    
    if (this.cronJob) {
      this.cronJob.destroy();
      this.cronJob = null;
    }
    
    this.isRunning = false;
    console.log('[OK] Token refresh service stopped');
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      schedule: this.config.cronSchedule,
      refreshThreshold: this.config.refreshThresholdHours,
      lastRun: this.lastRunTime || null,
      nextRun: this.cronJob ? this.cronJob.nextDate() : null
    };
  }

  /**
   * Find and refresh tokens that are close to expiry
   */
  async refreshExpiredTokens() {
    const startTime = Date.now();
    this.lastRunTime = new Date().toISOString();
    
    if (this.config.enableLogging) {
      console.log('[SEARCH] Token refresh job started at', this.lastRunTime);
    }

    try {
      // Find tokens that expire within the threshold
      const expiringTokens = await this.findExpiringTokens();
      
      if (expiringTokens.length === 0) {
        if (this.config.enableLogging) {
          console.log('[OK] No tokens require refreshing');
        }
        return { refreshed: 0, errors: 0, skipped: 0 };
      }

      console.log(`[LOADING] Found ${expiringTokens.length} tokens to refresh`);
      
      let refreshed = 0;
      let errors = 0;
      let skipped = 0;

      // Process tokens in batches to avoid overwhelming the system
      const tokensToProcess = expiringTokens.slice(0, this.config.maxTokensPerRun);
      
      for (const tokenRecord of tokensToProcess) {
        try {
          const result = await this.refreshToken(tokenRecord);
          if (result.success) {
            refreshed++;
            if (this.config.enableLogging) {
              console.log(`[OK] Refreshed token for user ${tokenRecord.user_id}, tool ${tokenRecord.tool_name}`);
            }
          } else {
            skipped++;
            if (this.config.enableLogging) {
              console.log(`[SKIP]  Skipped token for user ${tokenRecord.user_id}, tool ${tokenRecord.tool_name}: ${result.reason}`);
            }
          }
        } catch (error) {
          errors++;
          console.error(`[ERROR] Failed to refresh token for user ${tokenRecord.user_id}, tool ${tokenRecord.tool_name}:`, error.message);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`🏁 Token refresh job completed in ${duration}ms: ${refreshed} refreshed, ${errors} errors, ${skipped} skipped`);
      
      return { refreshed, errors, skipped, duration };
    } catch (error) {
      console.error('[ERROR] Token refresh job failed:', error);
      throw error;
    }
  }

  /**
   * Find tokens that are close to expiry
   */
  async findExpiringTokens() {
    const thresholdTime = new Date();
    thresholdTime.setHours(thresholdTime.getHours() + this.config.refreshThresholdHours);

    const query = `
      SELECT 
        user_id,
        tool_name,
        encrypted_refresh_token,
        token_expires_at,
        updated_at
      FROM user_credentials 
      WHERE encrypted_refresh_token IS NOT NULL
        AND token_expires_at IS NOT NULL 
        AND token_expires_at <= $1
        AND token_expires_at > NOW()
      ORDER BY token_expires_at ASC
    `;

    const result = await neonDB.query(query, [thresholdTime]);
    return result.rows;
  }

  /**
   * Refresh a single token
   */
  async refreshToken(tokenRecord) {
    try {
      const { user_id, tool_name } = tokenRecord;
      
      // Get current stored tokens
      const currentTokens = await this.credentialService.getOAuthTokens(user_id, tool_name);
      
      if (!currentTokens || !currentTokens.refresh_token) {
        return { success: false, reason: 'No refresh token available' };
      }

      // Attempt to refresh the token
      const refreshedTokens = await this.oauthService.refreshAccessToken(
        tool_name, 
        currentTokens.refresh_token
      );

      // Store the refreshed tokens
      await this.credentialService.storeOAuthTokens(user_id, tool_name, refreshedTokens);
      
      return { success: true, tokens: refreshedTokens };
    } catch (error) {
      // If refresh fails, the token might be permanently expired
      // We could implement logic here to notify the user or mark for re-authentication
      console.warn(`Token refresh failed for user ${tokenRecord.user_id}, tool ${tokenRecord.tool_name}:`, error.message);
      
      return { success: false, reason: error.message };
    }
  }

  /**
   * Manually refresh a specific token (for testing or immediate refresh)
   */
  async refreshSpecificToken(userId, toolName) {
    const tokenRecord = await neonDB.query(
      'SELECT * FROM user_credentials WHERE user_id = $1 AND tool_name = $2',
      [userId, toolName]
    );

    if (tokenRecord.rows.length === 0) {
      throw new Error('Token not found');
    }

    return await this.refreshToken(tokenRecord.rows[0]);
  }

  /**
   * Get statistics about token refresh activity
   */
  async getStatistics(days = 7) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const query = `
      SELECT 
        COUNT(*) as total_tokens,
        COUNT(CASE WHEN token_expires_at <= NOW() + INTERVAL '24 hours' THEN 1 END) as expiring_soon,
        COUNT(CASE WHEN token_expires_at <= NOW() THEN 1 END) as expired,
        COUNT(CASE WHEN encrypted_refresh_token IS NOT NULL THEN 1 END) as has_refresh_token
      FROM user_credentials 
      WHERE token_expires_at IS NOT NULL
        AND updated_at >= $1
    `;

    const result = await neonDB.query(query, [sinceDate]);
    return result.rows[0];
  }
}

module.exports = TokenRefreshService;