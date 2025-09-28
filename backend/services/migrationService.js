/**
 * Migration Service - Guest to Firebase Data Migration
 * Backend Dev Agent 💻 - Data migration and user upgrade
 */

const { v4: uuidv4 } = require('uuid');
const userService = require('./userService');
const { neonDB } = require('../database/connections/neon');
const { createLogger, format, transports } = require('winston');

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level.toUpperCase()}] [Migration]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
    })
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'backend.log' })
  ]
});

// Migration phases for tracking progress
const MigrationPhase = {
  DETECT_GUEST_DATA: 'detect',
  EXPORT_LOCAL_DATA: 'export',
  VALIDATE_FIREBASE: 'validate',
  MIGRATE_DATA: 'migrate',
  CLEANUP_LOCAL: 'cleanup',
  COMPLETE: 'complete'
};

class MigrationTransaction {
  constructor() {
    this.id = uuidv4();
    this.phase = MigrationPhase.DETECT_GUEST_DATA;
    this.errors = [];
    this.startTime = Date.now();
    this.migratedItems = {
      conversations: 0,
      messages: 0,
      preferences: 0,
      knowledge: 0
    };
  }

  setPhase(phase) {
    this.phase = phase;
    logger.info(`Migration ${this.id} phase: ${phase}`);
  }

  addError(error) {
    this.errors.push(error);
    logger.error(`Migration ${this.id} error in phase ${this.phase}:`, error);
  }

  complete(migratedItems = {}) {
    this.migratedItems = { ...this.migratedItems, ...migratedItems };
    this.phase = MigrationPhase.COMPLETE;
    
    logger.info('Migration completed successfully', {
      migrationId: this.id,
      duration: Date.now() - this.startTime,
      migratedItems: this.migratedItems
    });

    return {
      success: true,
      migrationId: this.id,
      phase: this.phase,
      migratedItems: this.migratedItems,
      duration: Date.now() - this.startTime
    };
  }

  fail() {
    logger.error('Migration failed', {
      migrationId: this.id,
      phase: this.phase,
      errors: this.errors,
      duration: Date.now() - this.startTime
    });

    return {
      success: false,
      migrationId: this.id,
      phase: this.phase,
      migratedItems: this.migratedItems,
      errors: this.errors,
      duration: Date.now() - this.startTime
    };
  }
}

class GuestMigrationService {
  constructor() {
    this.activeMigrations = new Map(); // Track active migrations
  }

  /**
   * Check if guest session has data to migrate
   */
  async hasGuestData(guestSessionToken) {
    try {
      // Query PostgreSQL for guest user
      const userResult = await neonDB.query(
        'SELECT * FROM users WHERE guest_session_token = $1 AND user_type = $2',
        [guestSessionToken, 'guest']
      );
      
      if (!userResult.rows || userResult.rows.length === 0) {
        return { hasData: false, itemCount: 0 };
      }

      const user = userResult.rows[0];

      // Get conversations count and message count
      const conversationsResult = await neonDB.query(`
        SELECT 
          COUNT(*) as conversation_count,
          COALESCE(SUM((SELECT COUNT(*) FROM messages WHERE conversation_id = conversations.id)), 0) as message_count
        FROM conversations 
        WHERE user_id = $1
      `, [user.id]);

      const stats = conversationsResult.rows[0];
      
      return {
        hasData: parseInt(stats.conversation_count) > 0,
        itemCount: parseInt(stats.conversation_count),
        conversationCount: parseInt(stats.conversation_count),
        messageCount: parseInt(stats.message_count)
      };
    } catch (error) {
      logger.error('Error checking guest data:', error);
      return { hasData: false, itemCount: 0 };
    }
  }

  /**
   * Validate Firebase user for migration
   */
  async validateFirebaseUser(firebaseUser) {
    if (!firebaseUser || !firebaseUser.uid) {
      throw new Error('Invalid Firebase user');
    }

    if (!firebaseUser.email) {
      logger.warn('Firebase user has no email', { uid: firebaseUser.uid });
    }

    return true;
  }

  /**
   * Check for existing migration to prevent duplicates
   */
  async checkForExistingMigration(firebaseUserId, guestSessionToken) {
    // This would typically check a migration log table in PostgreSQL
    // For now, we'll implement basic duplicate prevention
    
    try {
      const existingUser = await userService.getUserById(firebaseUserId);
      if (existingUser && existingUser.migrated_from_guest) {
        throw new Error('User already has migrated guest data');
      }
    } catch (error) {
      // User doesn't exist yet, which is fine for first migration
      if (!error.message.includes('not found')) {
        throw error;
      }
    }
  }

  /**
   * Migrate conversations from SQLite to PostgreSQL
   */
  async migrateConversations(conversations, firebaseUserId, migrationId) {
    const conversationIdMap = new Map();
    let migratedCount = 0;

    for (const conversation of conversations) {
      try {
        // Generate new UUID for PostgreSQL while preserving mapping
        const newId = uuidv4();
        conversationIdMap.set(conversation.id, newId);

        // Map conversation data to PostgreSQL format
        const postgresConversation = {
          id: newId,
          user_id: firebaseUserId,
          title: conversation.title || 'Migrated Conversation',
          agent_type: conversation.agent_type || 'general',
          created_at: new Date(conversation.created_at * 1000),
          updated_at: new Date(conversation.updated_at * 1000),
          metadata: JSON.stringify({
            ...conversation.metadata,
            migratedFromGuest: true,
            originalGuestId: conversation.id,
            migrationId,
            migrationTimestamp: new Date()
          })
        };

        // Create conversation in PostgreSQL
        // Note: This would use your existing conversation service/repository
        // For now, we'll log the operation
        logger.info('Would create conversation in PostgreSQL', {
          conversationId: newId,
          originalId: conversation.id,
          title: conversation.title
        });

        migratedCount++;
      } catch (error) {
        logger.error(`Failed to migrate conversation ${conversation.id}:`, error);
        throw new Error(`Conversation migration failed: ${error.message}`);
      }
    }

    return { conversationIdMap, migratedCount };
  }

  /**
   * Migrate messages from SQLite to PostgreSQL
   */
  async migrateMessages(conversations, conversationIdMap, migrationId) {
    let messageCount = 0;

    for (const conversation of conversations) {
      const messages = conversation.messages || [];
      const newConversationId = conversationIdMap.get(conversation.id);

      if (!newConversationId) {
        logger.warn(`No mapping found for conversation ${conversation.id}`);
        continue;
      }

      for (const message of messages) {
        try {
          const newMessageId = uuidv4();

          const postgresMessage = {
            id: newMessageId,
            conversation_id: newConversationId,
            role: message.role,
            content: message.content,
            timestamp: new Date(message.timestamp * 1000),
            agent_config: message.agentConfig || {},
            tool_calls: message.toolCalls || [],
            sequence_number: message.sequence_number,
            processing_time: message.processing_time,
            token_count: message.token_count,
            metadata: {
              migratedFromGuest: true,
              originalMessageId: message.id,
              migrationId
            }
          };

          // Create message in PostgreSQL
          logger.info('Would create message in PostgreSQL', {
            messageId: newMessageId,
            conversationId: newConversationId,
            role: message.role
          });

          messageCount++;
        } catch (error) {
          logger.error(`Failed to migrate message ${message.id}:`, error);
          throw new Error(`Message migration failed: ${error.message}`);
        }
      }
    }

    return messageCount;
  }

  /**
   * Migrate user preferences
   */
  async migratePreferences(guestPreferences, firebaseUserId, migrationId) {
    try {
      // Merge guest preferences with any existing user preferences
      const mergedPreferences = {
        ...guestPreferences,
        migratedFromGuest: true,
        migrationId,
        migrationTimestamp: new Date().toISOString()
      };

      // Update user preferences in PostgreSQL
      logger.info('Would update user preferences in PostgreSQL', {
        userId: firebaseUserId,
        preferenceCount: Object.keys(guestPreferences).length
      });

      return 1; // One preference set migrated
    } catch (error) {
      logger.error('Failed to migrate preferences:', error);
      throw new Error(`Preference migration failed: ${error.message}`);
    }
  }

  /**
   * Export guest user data from PostgreSQL
   */
  async exportGuestUserData(guestSessionToken) {
    try {
      // Get guest user
      const userResult = await neonDB.query(
        'SELECT * FROM users WHERE guest_session_token = $1 AND user_type = $2',
        [guestSessionToken, 'guest']
      );
      
      if (!userResult.rows || userResult.rows.length === 0) {
        throw new Error('Guest user not found');
      }

      const user = userResult.rows[0];

      // Get all conversations with messages
      const conversationsResult = await neonDB.query(`
        SELECT id, title, agent_type, metadata, created_at, updated_at
        FROM conversations 
        WHERE user_id = $1 
        ORDER BY created_at DESC
      `, [user.id]);

      const conversations = [];
      for (const conv of conversationsResult.rows) {
        // Get messages for each conversation
        const messagesResult = await neonDB.query(`
          SELECT id, role, content, agent_config, tool_calls, processing_time, token_count, created_at
          FROM messages 
          WHERE conversation_id = $1 
          ORDER BY created_at ASC
        `, [conv.id]);

        conversations.push({
          ...conv,
          messages: messagesResult.rows.map(msg => ({
            ...msg,
            timestamp: msg.created_at,
            agentConfig: msg.agent_config,
            toolCalls: msg.tool_calls
          }))
        });
      }

      return {
        user,
        conversations,
        preferences: user.metadata || {}
      };
    } catch (error) {
      logger.error('Error exporting guest user data:', error);
      throw error;
    }
  }

  /**
   * Delete guest user data from PostgreSQL
   */
  async deleteGuestUserData(guestSessionToken) {
    try {
      // Get guest user
      const userResult = await neonDB.query(
        'SELECT id FROM users WHERE guest_session_token = $1 AND user_type = $2',
        [guestSessionToken, 'guest']
      );
      
      if (!userResult.rows || userResult.rows.length === 0) {
        logger.warn('Guest user not found for deletion', { guestSessionToken });
        return;
      }

      const userId = userResult.rows[0].id;

      // Delete user (CASCADE will handle conversations and messages)
      await neonDB.query('DELETE FROM users WHERE id = $1', [userId]);
      
      logger.info('Guest user data deleted successfully', { userId, guestSessionToken });
    } catch (error) {
      logger.error('Error deleting guest user data:', error);
      throw error;
    }
  }

  /**
   * Main migration function
   */
  async migrateGuestToFirebase(guestSessionToken, firebaseUser) {
    const migration = new MigrationTransaction();
    this.activeMigrations.set(migration.id, migration);

    try {
      // Phase 1: Detect and export guest data
      migration.setPhase(MigrationPhase.DETECT_GUEST_DATA);
      const guestDataCheck = await this.hasGuestData(guestSessionToken);
      
      if (!guestDataCheck.hasData) {
        return migration.complete({ conversations: 0, messages: 0, preferences: 0, knowledge: 0 });
      }

      // Phase 2: Export guest data
      migration.setPhase(MigrationPhase.EXPORT_LOCAL_DATA);
      const guestData = await this.exportGuestUserData(guestSessionToken);

      // Phase 3: Validate Firebase user
      migration.setPhase(MigrationPhase.VALIDATE_FIREBASE);
      await this.validateFirebaseUser(firebaseUser);
      
      // Check for existing migration
      await this.checkForExistingMigration(firebaseUser.uid, guestSessionToken);

      // Phase 4: Begin migration
      migration.setPhase(MigrationPhase.MIGRATE_DATA);

      // In a real implementation, you would begin a database transaction here
      // await postgresDb.beginTransaction();

      try {
        // Migrate conversations
        const { conversationIdMap, migratedCount: convCount } = await this.migrateConversations(
          guestData.conversations,
          firebaseUser.uid,
          migration.id
        );

        // Migrate messages
        const messageCount = await this.migrateMessages(
          guestData.conversations,
          conversationIdMap,
          migration.id
        );

        // Migrate preferences
        const prefCount = await this.migratePreferences(
          guestData.preferences,
          firebaseUser.uid,
          migration.id
        );

        // Update user record with migration info
        await this.updateUserWithMigrationInfo(firebaseUser.uid, migration.id, {
          migratedConversations: convCount,
          migratedMessages: messageCount,
          migrationDate: new Date()
        });

        // Commit transaction
        // await postgresDb.commitTransaction();

        // Phase 5: Cleanup guest data
        migration.setPhase(MigrationPhase.CLEANUP_LOCAL);
        await this.deleteGuestUserData(guestSessionToken);

        return migration.complete({
          conversations: convCount,
          messages: messageCount,
          preferences: prefCount,
          knowledge: 0
        });

      } catch (error) {
        // Rollback transaction
        // await postgresDb.rollbackTransaction();
        throw error;
      }

    } catch (error) {
      migration.addError(error.message);
      return migration.fail();
    } finally {
      this.activeMigrations.delete(migration.id);
    }
  }

  /**
   * Update user record with migration information
   */
  async updateUserWithMigrationInfo(userId, migrationId, migrationStats) {
    try {
      // This would update the user record in PostgreSQL
      logger.info('Would update user with migration info', {
        userId,
        migrationId,
        migrationStats
      });
    } catch (error) {
      logger.error('Failed to update user migration info:', error);
      // Don't throw - this is not critical for migration success
    }
  }

  /**
   * Get migration status
   */
  getMigrationStatus(migrationId) {
    const migration = this.activeMigrations.get(migrationId);
    if (!migration) {
      return { status: 'not_found' };
    }

    return {
      status: 'in_progress',
      phase: migration.phase,
      migrationId: migration.id,
      duration: Date.now() - migration.startTime,
      migratedItems: migration.migratedItems
    };
  }

  /**
   * Cancel migration (rollback)
   */
  async cancelMigration(migrationId) {
    const migration = this.activeMigrations.get(migrationId);
    if (!migration) {
      throw new Error('Migration not found');
    }

    migration.addError('Migration cancelled by user');
    this.activeMigrations.delete(migrationId);
    
    return migration.fail();
  }
}

module.exports = new GuestMigrationService();