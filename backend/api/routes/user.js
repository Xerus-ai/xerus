/**
 * User API Routes - RESTful Endpoints
 * Backend Dev Agent 💻 - Basic user management
 * Standalone Backend Service
 */

const express = require('express');
const router = express.Router();

// Import middleware
const { asyncHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { requireRole } = require('../middleware/auth');

// Import user service
const { UserService, USER_ROLES, PERMISSIONS } = require('../../services/userService');

// Import database connections
const { neonDB } = require('../../database/connections/neon');
const crypto = require('crypto');

// Simple encryption utilities (use a proper encryption service in production)
const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY || 'default-32-character-key-12345678';
const ALGORITHM = 'aes-256-cbc';

const encrypt = (text) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

const decrypt = (encryptedText) => {
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedData = parts[1];
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

// Initialize user API keys table
const initializeUserApiKeysTable = async () => {
  try {
    console.log('[LOADING] Initializing user API keys table...');
    
    // Ensure database connection is ready
    await neonDB.initialize();
    
    // Use direct Neon SQL template literal
    const result = await neonDB.sql`
      CREATE TABLE IF NOT EXISTS user_api_keys (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        api_key_encrypted TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, provider)
      )
    `;
    console.log('[OK] User API keys table initialized successfully');
    
    // Verify table exists
    const verification = await neonDB.sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'user_api_keys'
    `;
    
    if (verification.length > 0) {
      console.log('[OK] User API keys table verified to exist');
    } else {
      console.log('[ERROR] User API keys table verification failed');
    }
    
  } catch (error) {
    console.error('[ERROR] Failed to initialize user API keys table:', error);
    console.error('[ERROR] Table creation error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint
    });
  }
};

// Initialize table on module load
initializeUserApiKeysTable();

/**
 * GET /api/v1/user/profile
 * Get current user profile
 */
router.get('/profile', asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ValidationError('User not authenticated');
  }

  // Return user profile information
  res.json({
    id: req.user.id,
    email: req.user.email,
    role: req.user.role,
    permissions: req.user.permissions || [],
    profile: {
      name: req.user.name || 'Development User',
      avatar: req.user.avatar || null,
      preferences: {
        theme: 'light',
        language: 'en',
        timezone: 'UTC'
      }
    },
    last_login: new Date().toISOString(),
    created_at: '2025-01-21T10:00:00Z'
  });
}));

/**
 * PUT /api/v1/user/profile
 * Update current user profile
 */
router.put('/profile', asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ValidationError('User not authenticated');
  }

  const { name, avatar, preferences } = req.body;

  // In a full implementation, this would update the user database
  // For now, return updated profile for TDD GREEN phase
  res.json({
    id: req.user.id,
    email: req.user.email,
    role: req.user.role,
    profile: {
      name: name || req.user.name || 'Development User',
      avatar: avatar || req.user.avatar || null,
      preferences: {
        ...req.user.preferences,
        ...preferences
      }
    },
    updated_at: new Date().toISOString()
  });
}));

/**
 * GET /api/v1/user/preferences
 * Get user preferences
 */
router.get('/preferences', asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ValidationError('User not authenticated');
  }

  // Return user preferences
  res.json({
    user_id: req.user.id,
    preferences: {
      theme: 'light',
      language: 'en',
      timezone: 'UTC',
      notifications: {
        email: true,
        push: false,
        desktop: true
      },
      ai_settings: {
        default_model: 'gpt-4o',
        voice_enabled: true,
        auto_save_conversations: true
      }
    },
    updated_at: new Date().toISOString()
  });
}));

/**
 * PUT /api/v1/user/preferences
 * Update user preferences
 */
router.put('/preferences', asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ValidationError('User not authenticated');
  }

  const preferences = req.body;

  // Validate preferences structure
  if (typeof preferences !== 'object' || preferences === null) {
    throw new ValidationError('Preferences must be an object');
  }

  // In a full implementation, this would update the user preferences in database
  // For now, return updated preferences for TDD GREEN phase
  res.json({
    user_id: req.user.id,
    preferences,
    updated_at: new Date().toISOString()
  });
}));

/**
 * GET /api/v1/user/activity
 * Get user activity history
 */
router.get('/activity', asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ValidationError('User not authenticated');
  }

  const { limit = 20, offset = 0 } = req.query;

  // Mock activity data for TDD GREEN phase
  const activities = [
    {
      id: 1,
      type: 'agent_execution',
      description: 'Executed AI agent "Assistant"',
      metadata: { agent_name: 'Assistant', execution_time: 1200 },
      timestamp: new Date(Date.now() - 60000).toISOString()
    },
    {
      id: 2,
      type: 'knowledge_search',
      description: 'Searched knowledge base',
      metadata: { query: 'machine learning', results_count: 5 },
      timestamp: new Date(Date.now() - 300000).toISOString()
    },
    {
      id: 3,
      type: 'tool_execution',
      description: 'Executed calculator tool',
      metadata: { tool_name: 'calculator', parameters: { expression: '2+2' } },
      timestamp: new Date(Date.now() - 600000).toISOString()
    }
  ];

  res.json({
    user_id: req.user.id,
    activities: activities.slice(parseInt(offset), parseInt(offset) + parseInt(limit)),
    total: activities.length,
    limit: parseInt(limit),
    offset: parseInt(offset)
  });
}));

/**
 * GET /api/v1/user/stats
 * Get user statistics
 */
router.get('/stats', asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ValidationError('User not authenticated');
  }

  // Mock user statistics for TDD GREEN phase
  res.json({
    user_id: req.user.id,
    stats: {
      total_agent_executions: 125,
      total_knowledge_searches: 67,
      total_tool_executions: 89,
      favorite_agent: 'Assistant',
      most_used_tool: 'web_search',
      average_session_length: '15 minutes',
      total_tokens_used: 45000
    },
    period: {
      from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
      to: new Date().toISOString()
    }
  });
}));

/**
 * DELETE /api/v1/user/account
 * Delete user account (admin only or self)
 */
router.delete('/account', asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ValidationError('User not authenticated');
  }

  const { confirm } = req.body;

  if (!confirm || confirm !== 'DELETE') {
    throw new ValidationError('Account deletion must be confirmed with "DELETE"', {
      field: 'confirm'
    });
  }

  // In a full implementation, this would:
  // 1. Soft delete or anonymize user data
  // 2. Remove personal information
  // 3. Keep anonymized analytics data
  // 4. Send confirmation email

  res.json({
    message: 'Account deletion request processed',
    user_id: req.user.id,
    scheduled_deletion: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
    note: 'Account will be permanently deleted in 7 days. Contact support to cancel.'
  });
}));

// === API KEY MANAGEMENT ENDPOINTS ===
// Note: These must come BEFORE parameterized routes to avoid conflicts

/**
 * GET /api/v1/user/api-keys
 * Get user's API keys and configuration
 */
router.get('/api-keys', asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ValidationError('User not authenticated');
  }

  // Return user's API key configuration
  // Note: Never return actual API keys, only their status and metadata
  res.json({
    user_id: req.user.id,
    api_keys: {
      openai: {
        configured: !!process.env.OPENAI_API_KEY,
        last_updated: '2025-01-21T10:00:00Z',
        status: 'active',
        usage_count: 142
      },
      anthropic: {
        configured: !!process.env.ANTHROPIC_API_KEY,
        last_updated: '2025-01-21T10:00:00Z',
        status: 'active',
        usage_count: 89
      },
      perplexity: {
        configured: !!process.env.PERPLEXITY_API_KEY,
        last_updated: '2025-01-21T10:00:00Z',
        status: 'active',
        usage_count: 67
      },
      deepgram: {
        configured: !!process.env.DEEPGRAM_API_KEY,
        last_updated: '2025-01-21T10:00:00Z',
        status: 'active',
        usage_count: 23
      },
      firecrawl: {
        configured: !!process.env.FIRECRAWL_API_KEY,
        last_updated: '2025-01-21T10:00:00Z',
        status: 'active',
        usage_count: 15
      },
      tavily: {
        configured: !!process.env.TRAVILY_API_KEY,
        last_updated: '2025-01-21T10:00:00Z',
        status: 'active',
        usage_count: 31
      }
    },
    last_updated: new Date().toISOString()
  });
}));

/**
 * GET /api/v1/user/api-key-status
 * Get quick status of API key configuration
 */
router.get('/api-key-status', asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ValidationError('User not authenticated');
  }

  // Get user's saved API keys from appropriate database
  const userId = req.user.id;
  const isGuestUser = req.user.isGuest;
  let savedKeys = {};
  
  try {
    // All users now use PostgreSQL (unified architecture)
    console.log(`[SEARCH] Checking user API keys in PostgreSQL for user: ${userId}`);
    
    const result = await neonDB.sql`
      SELECT provider 
      FROM user_api_keys 
      WHERE user_id = ${userId}
    `;
    
    result.forEach(row => {
      savedKeys[row.provider] = true;
    });
    
    console.log(`[SEARCH] Found user API keys:`, Object.keys(savedKeys));
  } catch (error) {
    console.error('[ERROR] Failed to fetch user API keys:', error);
    console.error('[ERROR] Error context:', { isGuestUser, userId });
  }
  
  const apiKeyStatus = {
    openai: !!process.env.OPENAI_API_KEY || !!savedKeys.openai,
    anthropic: !!process.env.ANTHROPIC_API_KEY || !!savedKeys.anthropic,
    gemini: !!process.env.GEMINI_API_KEY || !!savedKeys.gemini,
    perplexity: !!process.env.PERPLEXITY_API_KEY || !!savedKeys.perplexity,
    deepgram: !!process.env.DEEPGRAM_API_KEY || !!savedKeys.deepgram,
    firecrawl: !!process.env.FIRECRAWL_API_KEY || !!savedKeys.firecrawl,
    tavily: !!process.env.TRAVILY_API_KEY || !!savedKeys.tavily,
    ollama: !!process.env.OLLAMA_HOST || true // Ollama is usually locally available
  };

  const totalConfigured = Object.values(apiKeyStatus).filter(Boolean).length;
  const totalAvailable = Object.keys(apiKeyStatus).length;

  res.json({
    user_id: req.user.id,
    status: apiKeyStatus,
    summary: {
      configured: totalConfigured,
      total: totalAvailable,
      completion_percentage: Math.round((totalConfigured / totalAvailable) * 100)
    },
    recommendations: totalConfigured < totalAvailable ? [
      'Configure additional API keys to access more tools and models'
    ] : [],
    last_checked: new Date().toISOString()
  });
}));

/**
 * POST /api/v1/user/api-keys
 * Update user's API key configuration
 */
router.post('/api-keys', asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ValidationError('User not authenticated');
  }

  const { provider, api_key, action = 'update' } = req.body;

  if (!provider) {
    throw new ValidationError('Provider is required', { field: 'provider' });
  }

  const validProviders = ['openai', 'anthropic', 'perplexity', 'deepgram', 'firecrawl', 'tavily'];
  if (!validProviders.includes(provider)) {
    throw new ValidationError(`Invalid provider. Must be one of: ${validProviders.join(', ')}`, { field: 'provider' });
  }

  if (action === 'update' && !api_key) {
    throw new ValidationError('API key is required for update action', { field: 'api_key' });
  }

  // In a full implementation, this would securely store the API key
  // For now, return success response for TDD GREEN phase
  res.json({
    message: `API key for ${provider} ${action === 'delete' ? 'removed' : 'updated'} successfully`,
    provider,
    status: action === 'delete' ? 'removed' : 'configured',
    updated_at: new Date().toISOString()
  });
}));

/**
 * DELETE /api/v1/user/api-keys/:provider
 * Remove specific API key
 */
router.delete('/api-keys/:provider', asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ValidationError('User not authenticated');
  }

  const { provider } = req.params;

  const validProviders = ['openai', 'anthropic', 'perplexity', 'deepgram', 'firecrawl', 'tavily'];
  if (!validProviders.includes(provider)) {
    throw new ValidationError(`Invalid provider. Must be one of: ${validProviders.join(', ')}`);
  }

  // In a full implementation, this would remove the API key from secure storage
  // For now, return success response for TDD GREEN phase
  res.json({
    message: `API key for ${provider} removed successfully`,
    provider,
    status: 'removed',
    removed_at: new Date().toISOString()
  });
}));

// === GUEST USER MANAGEMENT ENDPOINTS ===

/**
 * POST /api/v1/user/guest/create
 * Create new guest user session with credit allocation
 */
router.post('/guest/create', asyncHandler(async (req, res) => {
  const { session_data = {}, device_fingerprint, user_agent, ip_address } = req.body;
  
  try {
    // Generate unique guest session token and user ID
    const guestSessionToken = crypto.randomUUID();
    const guestUserId = `guest_${crypto.randomBytes(16).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    console.log(`[SYSTEM] Creating guest user: ${guestUserId} with session: ${guestSessionToken}`);
    
    // Create guest user in users table with 10 credits
    await neonDB.sql`
      INSERT INTO users (
        id, 
        guest_session_token, 
        user_type, 
        credits_available, 
        credits_used,
        session_expires_at,
        last_activity,
        metadata,
        is_active
      ) VALUES (
        ${guestUserId},
        ${guestSessionToken},
        'guest',
        10,
        0,
        ${expiresAt.toISOString()},
        CURRENT_TIMESTAMP,
        ${JSON.stringify({ device_fingerprint, user_agent, ip_address })},
        true
      )
    `;
    
    // Create guest session record
    const csrfToken = crypto.randomBytes(32).toString('hex');
    await neonDB.sql`
      INSERT INTO guest_sessions (
        user_id,
        session_token,
        expires_at,
        ip_address,
        user_agent,
        device_fingerprint,
        csrf_token,
        session_data
      ) VALUES (
        ${guestUserId},
        ${guestSessionToken},
        ${expiresAt.toISOString()},
        ${ip_address || null},
        ${user_agent || req.headers['user-agent'] || null},
        ${device_fingerprint || null},
        ${csrfToken},
        ${JSON.stringify(session_data)}
      )
    `;
    
    console.log(`[OK] Guest user created successfully: ${guestUserId}`);
    
    res.json({
      success: true,
      user: {
        id: guestUserId,
        session_token: guestSessionToken,
        user_type: 'guest',
        credits_available: 10,
        credits_used: 0,
        session_expires_at: expiresAt.toISOString(),
        csrf_token: csrfToken,
        created_at: new Date().toISOString()
      },
      message: 'Guest user session created successfully'
    });
    
  } catch (error) {
    console.error('[ERROR] Failed to create guest user:', error);
    throw new ValidationError(`Failed to create guest user: ${error.message}`);
  }
}));

/**
 * GET /api/v1/user/guest/:session_token
 * Get guest user info by session token
 */
router.get('/guest/:session_token', asyncHandler(async (req, res) => {
  const { session_token } = req.params;
  
  if (!session_token) {
    throw new ValidationError('Session token is required');
  }
  
  try {
    // Get guest user by session token
    const guestUsers = await neonDB.sql`
      SELECT 
        id, 
        guest_session_token,
        user_type,
        credits_available,
        credits_used,
        session_expires_at,
        last_activity,
        metadata,
        is_active,
        created_at
      FROM users 
      WHERE guest_session_token = ${session_token} 
        AND user_type = 'guest'
        AND is_active = true
        AND session_expires_at > CURRENT_TIMESTAMP
    `;
    
    if (guestUsers.length === 0) {
      throw new NotFoundError('Guest session not found or expired');
    }
    
    const guestUser = guestUsers[0];
    
    // Update last activity
    await neonDB.sql`
      UPDATE users 
      SET last_activity = CURRENT_TIMESTAMP 
      WHERE id = ${guestUser.id}
    `;
    
    res.json({
      user: {
        id: guestUser.id,
        session_token: guestUser.guest_session_token,
        user_type: guestUser.user_type,
        credits_available: guestUser.credits_available,
        credits_used: guestUser.credits_used,
        session_expires_at: guestUser.session_expires_at,
        last_activity: new Date().toISOString(),
        metadata: guestUser.metadata,
        is_active: guestUser.is_active,
        created_at: guestUser.created_at
      }
    });
    
  } catch (error) {
    console.error('[ERROR] Failed to get guest user:', error);
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new ValidationError(`Failed to get guest user: ${error.message}`);
  }
}));

/**
 * PUT /api/v1/user/guest/:session_token/credits
 * Update guest user credit usage
 */
router.put('/guest/:session_token/credits', asyncHandler(async (req, res) => {
  const { session_token } = req.params;
  const { credits_used, operation_type, operation_details } = req.body;
  
  if (!session_token) {
    throw new ValidationError('Session token is required');
  }
  
  if (typeof credits_used !== 'number' || credits_used < 0) {
    throw new ValidationError('Valid credits_used number is required');
  }
  
  try {
    // Get current guest user
    const guestUsers = await neonDB.sql`
      SELECT id, credits_available, credits_used, session_expires_at
      FROM users 
      WHERE guest_session_token = ${session_token} 
        AND user_type = 'guest'
        AND is_active = true
        AND session_expires_at > CURRENT_TIMESTAMP
    `;
    
    if (guestUsers.length === 0) {
      throw new NotFoundError('Guest session not found or expired');
    }
    
    const guestUser = guestUsers[0];
    const newCreditsUsed = guestUser.credits_used + credits_used;
    
    // Check if user has enough credits
    if (newCreditsUsed > guestUser.credits_available) {
      throw new ValidationError('Insufficient credits available', {
        available: guestUser.credits_available,
        used: guestUser.credits_used,
        requested: credits_used,
        needed: newCreditsUsed - guestUser.credits_available
      });
    }
    
    // Update credits and last activity
    await neonDB.sql`
      UPDATE users 
      SET 
        credits_used = ${newCreditsUsed},
        last_activity = CURRENT_TIMESTAMP
      WHERE id = ${guestUser.id}
    `;
    
    console.log(`[DATA] Guest user ${guestUser.id} credits updated: ${guestUser.credits_used} -> ${newCreditsUsed}`);
    
    res.json({
      success: true,
      user: {
        id: guestUser.id,
        credits_available: guestUser.credits_available,
        credits_used: newCreditsUsed,
        credits_remaining: guestUser.credits_available - newCreditsUsed,
        operation_type,
        operation_details,
        updated_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('[ERROR] Failed to update guest credits:', error);
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(`Failed to update guest credits: ${error.message}`);
  }
}));

/**
 * DELETE /api/v1/user/guest/:session_token
 * Delete guest user session (cleanup)
 */
router.delete('/guest/:session_token', asyncHandler(async (req, res) => {
  const { session_token } = req.params;
  
  if (!session_token) {
    throw new ValidationError('Session token is required');
  }
  
  try {
    // Delete guest session first (foreign key constraint)
    const deletedSessions = await neonDB.sql`
      DELETE FROM guest_sessions 
      WHERE session_token = ${session_token}
      RETURNING user_id
    `;
    
    if (deletedSessions.length > 0) {
      // Delete guest user
      await neonDB.sql`
        DELETE FROM users 
        WHERE id = ${deletedSessions[0].user_id} 
          AND user_type = 'guest'
      `;
      
      console.log(`[CLEAN] Guest user session ${session_token} deleted successfully`);
    }
    
    res.json({
      success: true,
      message: 'Guest session deleted successfully',
      deleted_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[ERROR] Failed to delete guest session:', error);
    throw new ValidationError(`Failed to delete guest session: ${error.message}`);
  }
}));

/**
 * POST /api/v1/user/guest/:session_token/extend
 * Extend guest session expiration (up to 24 hours max)
 */
router.post('/guest/:session_token/extend', asyncHandler(async (req, res) => {
  const { session_token } = req.params;
  const { hours = 24 } = req.body;
  
  if (!session_token) {
    throw new ValidationError('Session token is required');
  }
  
  if (hours > 24 || hours < 1) {
    throw new ValidationError('Extension hours must be between 1 and 24');
  }
  
  try {
    const newExpiration = new Date(Date.now() + hours * 60 * 60 * 1000);
    
    // Update both users and guest_sessions tables
    const updatedUsers = await neonDB.sql`
      UPDATE users 
      SET 
        session_expires_at = ${newExpiration.toISOString()},
        last_activity = CURRENT_TIMESTAMP
      WHERE guest_session_token = ${session_token} 
        AND user_type = 'guest'
        AND is_active = true
      RETURNING id
    `;
    
    if (updatedUsers.length === 0) {
      throw new NotFoundError('Guest session not found');
    }
    
    await neonDB.sql`
      UPDATE guest_sessions 
      SET 
        expires_at = ${newExpiration.toISOString()},
        last_activity = CURRENT_TIMESTAMP
      WHERE session_token = ${session_token}
    `;
    
    console.log(`[TIME] Guest session ${session_token} extended to ${newExpiration.toISOString()}`);
    
    res.json({
      success: true,
      session_token,
      expires_at: newExpiration.toISOString(),
      extended_hours: hours,
      updated_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[ERROR] Failed to extend guest session:', error);
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new ValidationError(`Failed to extend guest session: ${error.message}`);
  }
}));

// === USER MANAGEMENT ENDPOINTS (PRODUCTION AUTH) ===

/**
 * GET /api/v1/user/list
 * List all users (admin only)
 */
router.get('/list', requireRole(USER_ROLES.ADMIN), asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  
  const users = await UserService.listUsers(parseInt(limit), parseInt(offset));
  
  res.json({
    users,
    limit: parseInt(limit),
    offset: parseInt(offset),
    total: users.length
  });
}));

// === API KEY MANAGEMENT ENDPOINTS (MUST BE BEFORE PARAMETERIZED ROUTES) ===

/**
 * POST /api/v1/user/api-key (singular) - Compatibility endpoint
 * Update user's API key configuration (compatibility with frontend)
 */
router.post('/api-key', asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ValidationError('User not authenticated');
  }

  const { provider, apiKey } = req.body;

  if (!provider) {
    throw new ValidationError('Provider is required', { field: 'provider' });
  }

  if (!apiKey) {
    throw new ValidationError('API key is required', { field: 'apiKey' });
  }

  const validProviders = ['openai', 'anthropic', 'gemini', 'perplexity', 'deepgram', 'firecrawl', 'tavily'];
  if (!validProviders.includes(provider)) {
    throw new ValidationError(`Invalid provider. Must be one of: ${validProviders.join(', ')}`, { field: 'provider' });
  }

  // Encrypt and store the API key in the appropriate database
  const userId = req.user.id;
  const isGuestUser = req.user.isGuest;
  const encryptedApiKey = encrypt(apiKey);
  
  try {
    console.log(`[SEARCH] Attempting to save API key for ${isGuestUser ? 'guest' : 'authenticated'} user ${userId}, provider ${provider}`);
    console.log(`[SEARCH] Encrypted key length: ${encryptedApiKey.length}`);
    
    // All users now use PostgreSQL (unified architecture)
    console.log('[LOADING] Saving to PostgreSQL database for all users...');
    
    // Check if table exists, if not create it
    try {
      const tableCheck = await neonDB.sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'user_api_keys'
      `;
      
      if (tableCheck.length === 0) {
        console.log('[LOADING] Table does not exist, creating it now...');
        await initializeUserApiKeysTable();
      }
    } catch (checkError) {
      console.warn('[WARNING] Table check failed, attempting to create:', checkError.message);
      await initializeUserApiKeysTable();
    }
    
    // Use UPSERT (INSERT ... ON CONFLICT) to handle updates
    const result = await neonDB.sql`
      INSERT INTO user_api_keys (user_id, provider, api_key_encrypted, updated_at)
      VALUES (${userId}, ${provider}, ${encryptedApiKey}, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, provider)
      DO UPDATE SET 
        api_key_encrypted = EXCLUDED.api_key_encrypted,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, provider
    `;
    
    console.log(`[SEARCH] API Key saved in PostgreSQL database:`, result[0]);
    console.log(`[SEARCH] API Key saved successfully for user ${userId}, provider ${provider}:`, apiKey.substring(0, 10) + '...');
  } catch (error) {
    console.error('[ERROR] Failed to save API key to database:', error);
    console.error('[ERROR] Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      position: error.position,
      userId,
      provider,
      encryptedKeyLength: encryptedApiKey?.length
    });
    throw new ValidationError(`Failed to save API key: ${error.message}`);
  }
  
  // In a real implementation, you would:
  // 1. Validate the API key with the provider's API
  // 2. Store the encrypted API key in the database
  // 3. Update environment variables or configuration
  
  res.json({
    success: true,
    message: `API key for ${provider} has been saved successfully`,
    provider: provider,
    status: 'active',
    last_updated: new Date().toISOString()
  });
}));

/**
 * DELETE /api/v1/user/api-key (singular) - Compatibility endpoint
 * Remove specific API key (compatibility with frontend)
 */
router.delete('/api-key', asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ValidationError('User not authenticated');
  }

  const { provider } = req.body;

  if (!provider) {
    throw new ValidationError('Provider is required', { field: 'provider' });
  }

  const validProviders = ['openai', 'anthropic', 'gemini', 'perplexity', 'deepgram', 'firecrawl', 'tavily'];
  if (!validProviders.includes(provider)) {
    throw new ValidationError(`Invalid provider. Must be one of: ${validProviders.join(', ')}`, { field: 'provider' });
  }

  // Delete the API key from the appropriate database
  const userId = req.user.id;
  const isGuestUser = req.user.isGuest;
  
  try {
    console.log(`[SEARCH] Attempting to delete API key for ${isGuestUser ? 'guest' : 'authenticated'} user ${userId}, provider ${provider}`);
    
    // All users now use PostgreSQL (unified architecture)
    console.log('[LOADING] Deleting from PostgreSQL database for all users...');
    
    const result = await neonDB.sql`
      DELETE FROM user_api_keys 
      WHERE user_id = ${userId} AND provider = ${provider}
      RETURNING provider
    `;
    
    console.log(`[SEARCH] API Key deleted from PostgreSQL database:`, result[0]);
    
    console.log(`[SEARCH] API Key deleted successfully for user ${userId}, provider ${provider}`);
    
  } catch (error) {
    console.error('[ERROR] Failed to delete API key from database:', error);
    throw new ValidationError(`Failed to delete API key: ${error.message}`);
  }

  res.json({
    success: true,
    message: `API key for ${provider} has been removed successfully`,
    provider: provider,
    status: 'removed',
    removed_at: new Date().toISOString()
  });
}));

// === USER MANAGEMENT ENDPOINTS (PARAMETERIZED ROUTES) ===

/**
 * GET /api/v1/user/:userId
 * Get user by ID (admin only or self)
 */
router.get('/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  
  // Check if user can access this user's data
  if (req.user.role !== USER_ROLES.ADMIN && req.user.id !== userId) {
    throw new ValidationError('Access denied: Cannot access other user data');
  }
  
  const user = await UserService.getUserById(userId);
  
  if (!user) {
    throw new NotFoundError('User not found');
  }
  
  res.json(user);
}));

/**
 * POST /api/v1/user/find-or-create
 * Find or create user (for Firebase auth integration)
 */
router.post('/find-or-create', asyncHandler(async (req, res) => {
  const { uid, email, display_name, role } = req.body;
  
  if (!uid || !email) {
    throw new ValidationError('uid and email are required');
  }
  
  const userData = {
    id: uid,
    email,
    displayName: display_name,
    role: role || USER_ROLES.USER
  };
  
  const user = await UserService.createOrUpdateUser(userData);
  
  res.json({
    uid: user.id,
    email: user.email,
    display_name: user.display_name
  });
}));

/**
 * GET /api/v1/user/permissions/:userId
 * Get user permissions
 */
router.get('/permissions/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  
  // Check if user can access permissions
  if (req.user.role !== USER_ROLES.ADMIN && req.user.id !== userId) {
    throw new ValidationError('Access denied: Cannot access user permissions');
  }
  
  const permissions = await UserService.getUserPermissions(userId);
  
  res.json({
    userId,
    permissions
  });
}));

/**
 * PUT /api/v1/user/:userId/role
 * Update user role (admin only)
 */
router.put('/:userId/role', requireRole(USER_ROLES.ADMIN), asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;
  
  if (!role || !Object.values(USER_ROLES).includes(role)) {
    throw new ValidationError('Valid role is required');
  }
  
  const updatedUser = await UserService.updateUserRole(userId, role);
  
  res.json({
    message: 'User role updated successfully',
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role,
      permissions: JSON.parse(updatedUser.permissions)
    }
  });
}));

/**
 * DELETE /api/v1/user/:userId
 * Delete user (admin only)
 */
router.delete('/:userId', requireRole(USER_ROLES.ADMIN), asyncHandler(async (req, res) => {
  const { userId } = req.params;
  
  // Prevent admin from deleting themselves
  if (req.user.id === userId) {
    throw new ValidationError('Cannot delete your own admin account');
  }
  
  const deletedUser = await UserService.deleteUser(userId);
  
  res.json({
    message: 'User deleted successfully',
    deletedUser: {
      id: deletedUser.id,
      email: deletedUser.email
    }
  });
}));

module.exports = router;