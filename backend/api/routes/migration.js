/**
 * Migration API Routes - Guest to Firebase Migration
 * Backend Dev Agent 💻 - Data migration endpoints
 */

const express = require('express');
const router = express.Router();

// Import services and middleware
const migrationService = require('../../services/migrationService');
const { asyncHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { authMiddleware, requireAuth } = require('../middleware/auth');

// Apply authentication middleware
router.use(authMiddleware);

/**
 * POST /api/v1/migration/check-guest-data
 * Check if guest session has data to migrate
 */
router.post('/check-guest-data', asyncHandler(async (req, res) => {
  const { guestSessionToken } = req.body;
  
  if (!guestSessionToken) {
    throw new ValidationError('Guest session token is required', { field: 'guestSessionToken' });
  }
  
  const guestData = await migrationService.hasGuestData(guestSessionToken);
  
  res.json({
    hasGuestData: guestData.hasData,
    itemCount: guestData.itemCount,
    conversationCount: guestData.conversationCount || 0,
    messageCount: guestData.messageCount || 0,
    canMigrate: guestData.hasData
  });
}));

/**
 * POST /api/v1/migration/guest-to-firebase
 * Migrate guest user data to Firebase authenticated user
 */
router.post('/guest-to-firebase', requireAuth, asyncHandler(async (req, res) => {
  const { guestSessionToken } = req.body;
  const firebaseUser = req.user;
  
  if (!guestSessionToken) {
    throw new ValidationError('Guest session token is required', { field: 'guestSessionToken' });
  }
  
  if (!firebaseUser || firebaseUser.isGuest) {
    throw new ValidationError('Must be authenticated with Firebase to migrate data');
  }
  
  // Start migration process
  const migrationResult = await migrationService.migrateGuestToFirebase(
    guestSessionToken,
    firebaseUser
  );
  
  if (migrationResult.success) {
    res.json({
      success: true,
      message: 'Guest data migrated successfully',
      migrationId: migrationResult.migrationId,
      migratedItems: migrationResult.migratedItems,
      duration: migrationResult.duration
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Migration failed',
      errors: migrationResult.errors,
      phase: migrationResult.phase
    });
  }
}));

/**
 * GET /api/v1/migration/status/:migrationId
 * Get migration status
 */
router.get('/status/:migrationId', asyncHandler(async (req, res) => {
  const { migrationId } = req.params;
  
  const status = migrationService.getMigrationStatus(migrationId);
  
  if (status.status === 'not_found') {
    throw new NotFoundError('Migration not found');
  }
  
  res.json(status);
}));

/**
 * DELETE /api/v1/migration/:migrationId
 * Cancel ongoing migration
 */
router.delete('/:migrationId', requireAuth, asyncHandler(async (req, res) => {
  const { migrationId } = req.params;
  
  try {
    const result = await migrationService.cancelMigration(migrationId);
    
    res.json({
      success: false,
      message: 'Migration cancelled',
      migrationId,
      result
    });
  } catch (error) {
    if (error.message === 'Migration not found') {
      throw new NotFoundError('Migration not found');
    }
    throw error;
  }
}));

/**
 * POST /api/v1/migration/preview-guest-data
 * Preview guest data without migrating
 */
router.post('/preview-guest-data', asyncHandler(async (req, res) => {
  const { guestSessionToken } = req.body;
  
  if (!guestSessionToken) {
    throw new ValidationError('Guest session token is required', { field: 'guestSessionToken' });
  }
  
  try {
    // Query PostgreSQL for guest user data
    const { neonDB } = require('../../database/connections/neon');
    
    const userResult = await neonDB.query(
      'SELECT * FROM users WHERE guest_session_token = $1 AND user_type = $2',
      [guestSessionToken, 'guest']
    );
    
    if (!userResult.rows || userResult.rows.length === 0) {
      return res.json({
        hasData: false,
        preview: null
      });
    }
    
    const user = userResult.rows[0];
    
    // Get conversations for preview
    const conversationsResult = await neonDB.query(`
      SELECT 
        id, title, agent_type, created_at, updated_at,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = conversations.id) as message_count
      FROM conversations 
      WHERE user_id = $1 
      ORDER BY updated_at DESC 
      LIMIT 10
    `, [user.id]);
    
    const conversations = conversationsResult.rows;
    
    // Get user preferences from metadata
    const preferences = user.metadata || {};
    
    // Get sample messages from first conversation
    let sampleMessages = [];
    if (conversations.length > 0) {
      const messagesResult = await neonDB.query(`
        SELECT role, content, created_at as timestamp
        FROM messages 
        WHERE conversation_id = $1 
        ORDER BY created_at ASC 
        LIMIT 5
      `, [conversations[0].id]);
      sampleMessages = messagesResult.rows;
    }
    
    const preview = {
      user: {
        displayName: user.display_name,
        createdAt: user.created_at,
        lastActive: user.last_activity
      },
      conversations: conversations.map(conv => ({
        id: conv.id,
        title: conv.title,
        agentType: conv.agent_type,
        messageCount: conv.message_count,
        createdAt: conv.created_at,
        updatedAt: conv.updated_at
      })),
      sampleMessages: sampleMessages.map(msg => ({
        role: msg.role,
        content: msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : ''),
        timestamp: msg.timestamp
      })),
      preferences,
      totalCounts: {
        conversations: conversations.length,
        messages: conversations.reduce((sum, conv) => sum + (conv.message_count || 0), 0),
        preferences: Object.keys(preferences).length
      }
    };
    
    res.json({
      hasData: true,
      preview
    });
    
  } catch (error) {
    res.json({
      hasData: false,
      preview: null,
      error: error.message
    });
  }
}));

module.exports = router;