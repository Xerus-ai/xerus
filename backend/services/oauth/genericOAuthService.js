/**
 * Generic OAuth Service - Multi-Provider OAuth 2.0 Authentication
 * Uses simple-oauth2 for standardized OAuth flows across all tools
 * 
 * Supports: Google, Microsoft, Slack, Notion, GitHub, and more
 */

const { AuthorizationCode } = require('simple-oauth2');

class GenericOAuthService {
  constructor() {
    // OAuth provider configurations (simple-oauth2 compatible)
    this.providers = {
      google: {
        client: {
          id: process.env.GOOGLE_CLIENT_ID,
          secret: process.env.GOOGLE_CLIENT_SECRET
        },
        auth: {
          tokenHost: 'https://oauth2.googleapis.com',
          tokenPath: '/token',
          authorizePath: '/auth'
        },
        options: {
          bodyFormat: 'json',
          authorizationMethod: 'body'
        }
      },
      slack: {
        client: {
          id: process.env.SLACK_CLIENT_ID,
          secret: process.env.SLACK_CLIENT_SECRET
        },
        auth: {
          tokenHost: 'https://slack.com',
          tokenPath: '/api/oauth.v2.access',
          authorizePath: '/oauth/v2/authorize'
        }
      },
      notion: {
        client: {
          id: process.env.NOTION_CLIENT_ID,
          secret: process.env.NOTION_CLIENT_SECRET
        },
        auth: {
          tokenHost: 'https://api.notion.com',
          tokenPath: '/v1/oauth/token',
          authorizePath: '/v1/oauth/authorize'
        }
      },
      github: {
        client: {
          id: process.env.GITHUB_CLIENT_ID,
          secret: process.env.GITHUB_CLIENT_SECRET
        },
        auth: {
          tokenHost: 'https://github.com',
          tokenPath: '/login/oauth/access_token',
          authorizePath: '/login/oauth/authorize'
        }
      },
      microsoft: {
        client: {
          id: process.env.MICROSOFT_CLIENT_ID,
          secret: process.env.MICROSOFT_CLIENT_SECRET
        },
        auth: {
          tokenHost: 'https://login.microsoftonline.com',
          tokenPath: '/common/oauth2/v2.0/token',
          authorizePath: '/common/oauth2/v2.0/authorize'
        }
      },
      atlassian: {
        client: {
          id: process.env.ATLASSIAN_OAUTH_CLIENT_ID,
          secret: process.env.ATLASSIAN_OAUTH_CLIENT_SECRET
        },
        auth: {
          tokenHost: 'https://auth.atlassian.com',
          tokenPath: '/oauth/token',
          authorizePath: '/authorize'
        },
        options: {
          bodyFormat: 'json',
          authorizationMethod: 'body'
        }
      }
    };

    // Separate scopes object for tools (not passed to simple-oauth2)
    this.toolScopes = {
      // Google scopes
      'google_calendar': ['https://www.googleapis.com/auth/calendar'],
      'gmail': ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'],
      
      // Slack scopes  
      'slack': ['channels:read', 'chat:write', 'users:read'],
      
      // Notion scopes
      'notion': ['read', 'write'],
      
      // GitHub scopes
      'github': ['repo', 'user'],
      
      // Microsoft scopes
      'microsoft_outlook': ['https://graph.microsoft.com/Mail.Read', 'https://graph.microsoft.com/Mail.Send'],
      'microsoft_teams': ['https://graph.microsoft.com/Team.ReadBasic.All', 'https://graph.microsoft.com/Channel.ReadBasic.All'],
      
      // Atlassian scopes
      'atlassian-remote': ['read:jira-user', 'read:jira-work', 'write:jira-work', 'read:confluence-space.summary', 'read:confluence-props', 'write:confluence-props', 'read:confluence-content.all', 'write:confluence-content', 'offline_access'],
      'jira': ['read:jira-user', 'read:jira-work', 'write:jira-work', 'offline_access'],
      'confluence': ['read:confluence-space.summary', 'read:confluence-props', 'write:confluence-props', 'read:confluence-content.all', 'write:confluence-content', 'offline_access']
    };
  }


  /**
   * Get OAuth client for a specific provider
   */
  getOAuthClient(providerName) {
    const config = this.providers[providerName];
    if (!config) {
      throw new Error(`OAuth provider '${providerName}' not configured`);
    }

    if (!config.client.id || !config.client.secret) {
      throw new Error(`OAuth credentials missing for provider '${providerName}'`);
    }

    return new AuthorizationCode(config);
  }

  /**
   * Generate OAuth authorization URL for a tool
   */
  generateAuthUrl(toolName, providerName = null, redirectUri = null, userId = null) {
    try {
      // Auto-detect provider from tool name if not provided
      if (!providerName) {
        providerName = this.detectProvider(toolName);
      }

      const client = this.getOAuthClient(providerName);
      const config = this.providers[providerName];
      
      // Get scopes for this specific tool
      const scopes = this.getToolScopes(toolName, providerName);
      
      // Create state with user ID for proper session tracking
      let state = `${toolName}:${Date.now()}`;
      if (userId) {
        state = `${toolName}:${userId}:${Date.now()}`;
      }
      
      const authParams = {
        redirect_uri: redirectUri || `${process.env.API_BASE_URL}/tools/${toolName}/auth/callback`,
        scope: scopes.join(' '),
        state: state,
      };

      // Add provider-specific parameters
      if (providerName === 'atlassian') {
        // Atlassian-specific OAuth parameters
        authParams.audience = 'api.atlassian.com';
        authParams.response_type = 'code';
        authParams.prompt = 'consent'; // Force consent to ensure offline_access scope is granted
        
        console.log(`[SEARCH] [${toolName}] Atlassian OAuth URL params:`, {
          scope: authParams.scope,
          audience: authParams.audience,
          prompt: authParams.prompt,
          redirect_uri: authParams.redirect_uri
        });
        
        // Include cloud_id in state for Atlassian
        if (process.env.ATLASSIAN_OAUTH_CLOUD_ID) {
          if (userId) {
            authParams.state = `${toolName}:${userId}:${process.env.ATLASSIAN_OAUTH_CLOUD_ID}:${Date.now()}`;
          } else {
            authParams.state = `${toolName}:${process.env.ATLASSIAN_OAUTH_CLOUD_ID}:${Date.now()}`;
          }
        }
      } else {
        // Google-specific parameters (for other providers)
        authParams.access_type = 'offline'; // Request refresh token
        authParams.prompt = 'consent'; // Force consent screen for refresh token
      }

      const authorizationUri = client.authorizeURL(authParams);

      return authorizationUri;
    } catch (error) {
      throw new Error(`Failed to generate auth URL for ${toolName}: ${error.message}`);
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(toolName, authCode, redirectUri = null, providerName = null) {
    try {
      // Auto-detect provider if not provided
      if (!providerName) {
        providerName = this.detectProvider(toolName);
      }

      const client = this.getOAuthClient(providerName);

      const tokenParams = {
        code: authCode,
        redirect_uri: redirectUri || `${process.env.API_BASE_URL}/tools/${toolName}/auth/callback`,
        scope: this.getToolScopes(toolName, providerName).join(' ')
      };

      const accessToken = await client.getToken(tokenParams);
      
      // Extract token data in standardized format
      const tokenData = accessToken.token;
      
      console.log(`[SEARCH] [${toolName}] Raw token data from ${providerName}:`, {
        access_token: tokenData.access_token ? '***' : undefined,
        refresh_token: tokenData.refresh_token ? '***' : undefined,
        expires_at: tokenData.expires_at,
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type,
        scope: tokenData.scope
      });
      
      // Calculate expiration date properly
      let expirationDate = null;
      if (tokenData.expires_at) {
        // If expires_at is provided, check if it's seconds or milliseconds
        const timestamp = tokenData.expires_at;
        
        // More robust timestamp detection
        // If timestamp is less than year 2050 in seconds (2524608000), it's probably seconds
        // If timestamp is less than year 2050 in milliseconds (2524608000000), it's probably milliseconds
        // Otherwise, it might be a malformed value
        
        if (timestamp < 2524608000) {
          // Timestamp in seconds - convert to milliseconds
          expirationDate = new Date(timestamp * 1000);
          console.log(`[TOOL] [OAuth] Converted timestamp from seconds: ${timestamp} -> ${expirationDate.toISOString()}`);
        } else if (timestamp < 2524608000000) {
          // Timestamp in milliseconds - use directly
          expirationDate = new Date(timestamp);
          console.log(`[TOOL] [OAuth] Using timestamp as milliseconds: ${timestamp} -> ${expirationDate.toISOString()}`);
        } else {
          // Timestamp is too large - this might be an error
          // Fall back to 1 hour from now to prevent absurd dates
          console.warn(`[WARNING] [OAuth] Token expires_at timestamp seems invalid (${timestamp}), falling back to 1 hour expiry`);
          expirationDate = new Date(Date.now() + (3600 * 1000)); // 1 hour
          console.log(`[TOOL] [OAuth] Fallback expiry set to: ${expirationDate.toISOString()}`);
        }
      } else if (tokenData.expires_in) {
        // If only expires_in is provided, calculate from current time
        // expires_in should always be in seconds per OAuth 2.0 spec
        expirationDate = new Date(Date.now() + (tokenData.expires_in * 1000));
      }
      
      const result = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expirationDate,
        token_type: tokenData.token_type || 'Bearer',
        scope: tokenData.scope
      };
      
      console.log(`[OK] [${toolName}] Processed token result:`, {
        has_access_token: !!result.access_token,
        has_refresh_token: !!result.refresh_token,
        expires_at: result.expires_at,
        token_type: result.token_type
      });
      
      return result;
    } catch (error) {
      throw new Error(`Failed to exchange code for tokens (${toolName}): ${error.message}`);
    }
  }

  /**
   * Exchange authorization code for tokens using custom OAuth app credentials
   */
  async exchangeCodeForTokensCustom({ code, client_id, client_secret, redirect_uri, provider }) {
    try {
      // Create custom OAuth client configuration
      const customConfig = {
        client: {
          id: client_id,
          secret: client_secret
        },
        auth: {
          tokenHost: 'https://auth.atlassian.com',
          tokenPath: '/oauth/token',
          authorizePath: '/authorize'
        },
        options: {
          bodyFormat: 'json',
          authorizationMethod: 'body'
        }
      };

      const customClient = new AuthorizationCode(customConfig);

      const tokenParams = {
        code: code,
        redirect_uri: redirect_uri,
        // Atlassian doesn't require scope in token request
      };

      console.log(`[LOADING] Exchanging code for tokens using custom OAuth app`);
      const accessToken = await customClient.getToken(tokenParams);
      
      // Extract token data in standardized format
      const tokenData = accessToken.token;
      
      console.log(`[SEARCH] [Custom OAuth] Raw token data from ${provider}:`, {
        access_token: tokenData.access_token ? '***' : undefined,
        refresh_token: tokenData.refresh_token ? '***' : undefined,
        expires_at: tokenData.expires_at,
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type,
        scope: tokenData.scope
      });
      
      // Calculate expiration date properly (same logic as regular OAuth)
      let expirationDate = null;
      if (tokenData.expires_at) {
        // If expires_at is provided, check if it's seconds or milliseconds
        const timestamp = tokenData.expires_at;
        
        // More robust timestamp detection
        // If timestamp is less than year 2050 in seconds (2524608000), it's probably seconds
        // If timestamp is less than year 2050 in milliseconds (2524608000000), it's probably milliseconds
        // Otherwise, it might be a malformed value
        
        if (timestamp < 2524608000) {
          // Timestamp in seconds - convert to milliseconds
          expirationDate = new Date(timestamp * 1000);
          console.log(`[TOOL] [Custom OAuth] Converted timestamp from seconds: ${timestamp} -> ${expirationDate.toISOString()}`);
        } else if (timestamp < 2524608000000) {
          // Timestamp in milliseconds - use directly
          expirationDate = new Date(timestamp);
          console.log(`[TOOL] [Custom OAuth] Using timestamp as milliseconds: ${timestamp} -> ${expirationDate.toISOString()}`);
        } else {
          // Timestamp is too large - this might be an error
          // Fall back to 1 hour from now to prevent absurd dates
          console.warn(`[WARNING] [Custom OAuth] Token expires_at timestamp seems invalid (${timestamp}), falling back to 1 hour expiry`);
          expirationDate = new Date(Date.now() + (3600 * 1000)); // 1 hour
          console.log(`[TOOL] [Custom OAuth] Fallback expiry set to: ${expirationDate.toISOString()}`);
        }
      } else if (tokenData.expires_in) {
        // If only expires_in is provided, calculate from current time
        // expires_in should always be in seconds per OAuth 2.0 spec
        expirationDate = new Date(Date.now() + (tokenData.expires_in * 1000));
      }
      
      const result = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expirationDate,
        token_type: tokenData.token_type || 'Bearer',
        scope: tokenData.scope
      };
      
      console.log(`[OK] [Custom OAuth] Processed token result:`, {
        has_access_token: !!result.access_token,
        has_refresh_token: !!result.refresh_token,
        expires_at: result.expires_at,
        token_type: result.token_type
      });
      
      return result;
    } catch (error) {
      console.error('Custom OAuth token exchange failed:', error);
      throw new Error(`Failed to exchange code for tokens using custom OAuth app: ${error.message}`);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(toolName, refreshToken, providerName = null) {
    try {
      if (!providerName) {
        providerName = this.detectProvider(toolName);
      }

      const client = this.getOAuthClient(providerName);
      
      // Create access token object from stored data
      const tokenObject = client.createToken({
        access_token: 'dummy', // Required but will be refreshed
        refresh_token: refreshToken
      });

      const refreshedToken = await tokenObject.refresh();
      const tokenData = refreshedToken.token;

      return {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || refreshToken, // Some providers don't return new refresh token
        expires_at: tokenData.expires_at ? new Date(tokenData.expires_at * 1000) : null,
        token_type: tokenData.token_type || 'Bearer',
        scope: tokenData.scope
      };
    } catch (error) {
      throw new Error(`Failed to refresh access token (${toolName}): ${error.message}`);
    }
  }

  /**
   * Revoke tokens
   */
  async revokeTokens(toolName, accessToken, refreshToken = null, providerName = null) {
    try {
      if (!providerName) {
        providerName = this.detectProvider(toolName);
      }

      const client = this.getOAuthClient(providerName);
      
      const tokenObject = client.createToken({
        access_token: accessToken,
        refresh_token: refreshToken
      });

      await tokenObject.revokeAll();
      return true;
    } catch (error) {
      console.error(`Failed to revoke tokens (${toolName}):`, error.message);
      return false; // Non-critical error, token will expire naturally
    }
  }

  /**
   * Auto-detect OAuth provider from tool name
   */
  detectProvider(toolName) {
    const providerMap = {
      'google_calendar': 'google',
      'gmail': 'google',
      'google_drive': 'google',
      'slack': 'slack',
      'notion': 'notion',
      'github': 'github',
      'microsoft_outlook': 'microsoft',
      'microsoft_teams': 'microsoft',
      'atlassian-remote': 'atlassian',
      'jira': 'atlassian',
      'confluence': 'atlassian'
    };

    const provider = providerMap[toolName];
    if (!provider) {
      throw new Error(`Unknown OAuth provider for tool: ${toolName}`);
    }

    return provider;
  }

  /**
   * Get required scopes for a specific tool
   */
  getToolScopes(toolName, providerName) {
    return this.toolScopes[toolName] || [];
  }

  /**
   * Validate OAuth configuration for a provider
   */
  validateProviderConfig(providerName) {
    const config = this.providers[providerName];
    if (!config) {
      throw new Error(`OAuth provider '${providerName}' not configured`);
    }

    const missing = [];
    if (!config.client.id) missing.push(`${providerName.toUpperCase()}_CLIENT_ID`);
    if (!config.client.secret) missing.push(`${providerName.toUpperCase()}_CLIENT_SECRET`);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    return true;
  }

  /**
   * Get list of supported providers
   */
  getSupportedProviders() {
    return Object.keys(this.providers);
  }

  /**
   * Get list of supported tools for a provider
   */
  getSupportedTools(providerName) {
    // Filter toolScopes by provider
    const providerTools = Object.keys(this.toolScopes).filter(toolName => {
      return this.detectProvider(toolName) === providerName;
    });
    return providerTools;
  }
}

module.exports = GenericOAuthService;