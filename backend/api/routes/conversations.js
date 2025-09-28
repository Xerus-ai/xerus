/**
 * Conversations API Routes - Guest User Support
 * Backend Dev Agent 💻 - Local conversation management for guest users
 */

const express = require('express');
const router = express.Router();

// Import services and middleware  
const { neonDB } = require('../../database/connections/neon');
const { asyncHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { authMiddleware, requireGuestPermission, requireAuth } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(authMiddleware);

/**
 * GET /api/v1/conversations  
 * List conversations for current user
 * All users now use unified PostgreSQL storage with credit system
 */
router.get('/', requireGuestPermission('conversations:read'), asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query;
  
  // All users (guest and authenticated) now use PostgreSQL
  const result = await neonDB.query(`
    SELECT 
      id,
      user_id,
      title,
      agent_type,
      metadata,
      created_at,
      updated_at
    FROM conversations 
    WHERE user_id = $1 
    ORDER BY updated_at DESC 
    LIMIT $2
    `, [req.user.id, parseInt(limit)]);
    
  const conversations = result.rows.map(row => ({
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    agentType: row.agent_type,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
    created_at: Math.floor(new Date(row.created_at).getTime() / 1000),
    updated_at: Math.floor(new Date(row.updated_at).getTime() / 1000)
  }));
  
  // Set guest mode header for guest users
  if (req.user.isGuest) {
    res.set('X-Guest-Mode', 'true');
  }
  
  res.json(conversations);
}));

/**
 * GET /api/v1/conversations/:id
 * Get specific conversation with messages
 */
router.get('/:id', requireGuestPermission('conversations:read'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  if (req.user.isGuest) {
    const user = await guestDataService.getGuestUser(req.user.guestSession);
    if (!user) {
      return res.status(404).json({ error: 'Guest user not found' });
    }
    
    const conversation = await guestDataService.getConversation(id, user.id);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }
    
    const messages = await guestDataService.getConversationMessages(id);
    
    res.json({
      ...conversation,
      messages
    });
  } else {
    // Authenticated users: Get conversation from PostgreSQL
    const conversationResult = await neonDB.query(`
      SELECT 
        id,
        user_id,
        title,
        agent_type,
        metadata,
        created_at,
        updated_at
      FROM conversations 
      WHERE id = $1 AND user_id = $2
    `, [id, req.user.id]);
    
    if (conversationResult.rowCount === 0) {
      throw new NotFoundError('Conversation not found');
    }
    
    const conversation = conversationResult.rows[0];
    
    // Get messages for the conversation
    const messagesResult = await neonDB.query(`
      SELECT 
        id,
        conversation_id,
        role,
        content,
        agent_config,
        tool_calls,
        processing_time,
        token_count,
        created_at
      FROM messages 
      WHERE conversation_id = $1 
      ORDER BY created_at ASC
    `, [id]);
    
    const messages = messagesResult.rows.map(row => ({
      id: row.id,
      conversation_id: row.conversation_id,
      role: row.role,
      content: row.content,
      agentConfig: typeof row.agent_config === 'string' ? JSON.parse(row.agent_config) : row.agent_config,
      toolCalls: typeof row.tool_calls === 'string' ? JSON.parse(row.tool_calls) : row.tool_calls,
      processingTime: row.processing_time,
      tokenCount: row.token_count,
      timestamp: Math.floor(new Date(row.created_at).getTime() / 1000)
    }));
    
    res.json({
      id: conversation.id,
      user_id: conversation.user_id,
      title: conversation.title,
      agentType: conversation.agent_type,
      metadata: typeof conversation.metadata === 'string' ? JSON.parse(conversation.metadata) : conversation.metadata,
      created_at: Math.floor(new Date(conversation.created_at).getTime() / 1000),
      updated_at: Math.floor(new Date(conversation.updated_at).getTime() / 1000),
      messages
    });
  }
}));

/**
 * POST /api/v1/conversations
 * Create new conversation
 */
router.post('/', requireGuestPermission('conversations:create'), asyncHandler(async (req, res) => {
  const { title, agentType, metadata = {} } = req.body;
  
  if (req.user.isGuest) {
    // Validate agent type for guests
    const allowedTypes = ['perplexity', 'firecrawl', 'tavily', 'general'];
    if (agentType && !allowedTypes.includes(agentType)) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please sign in to use this agent type',
        guestMode: true,
        allowedTypes
      });
    }
    
    let user = await guestDataService.getGuestUser(req.user.guestSession);
    if (!user) {
      // Create guest user if doesn't exist
      const userId = await guestDataService.createGuestUser(req.user.guestSession, {
        displayName: 'Guest User',
        userAgent: req.get('User-Agent')
      });
      user = await guestDataService.getGuestUser(req.user.guestSession);
    }
    
    const conversationId = await guestDataService.createConversation(user.id, {
      title: title || 'New Conversation',
      agentType: agentType || 'general',
      metadata
    });
    
    const conversation = await guestDataService.getConversation(conversationId, user.id);
    
    res.status(201).json(conversation);
  } else {
    // Authenticated users: Create conversation in PostgreSQL
    const result = await neonDB.query(`
      INSERT INTO conversations (user_id, title, agent_type, metadata, created_at, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, user_id, title, agent_type, metadata, created_at, updated_at
    `, [
      req.user.id,
      title || 'New Conversation',
      agentType || 'general',
      JSON.stringify(metadata)
    ]);
    
    const conversation = result.rows[0];
    
    res.status(201).json({
      id: conversation.id,
      user_id: conversation.user_id,
      title: conversation.title,
      agentType: conversation.agent_type,
      metadata: typeof conversation.metadata === 'string' ? JSON.parse(conversation.metadata) : conversation.metadata,
      created_at: Math.floor(new Date(conversation.created_at).getTime() / 1000),
      updated_at: Math.floor(new Date(conversation.updated_at).getTime() / 1000)
    });
  }
}));

/**
 * POST /api/v1/conversations/:id/messages
 * Add message to conversation
 */
router.post('/:id/messages', requireGuestPermission('conversations:create'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role, content, agentConfig = {}, toolCalls = [] } = req.body;
  
  if (!role || !content) {
    throw new ValidationError('Role and content are required', { fields: ['role', 'content'] });
  }
  
  if (!['user', 'assistant', 'system'].includes(role)) {
    throw new ValidationError('Invalid role', { validRoles: ['user', 'assistant', 'system'] });
  }
  
  if (req.user.isGuest) {
    const user = await guestDataService.getGuestUser(req.user.guestSession);
    if (!user) {
      return res.status(404).json({ error: 'Guest user not found' });
    }
    
    // Verify conversation exists and belongs to user
    const conversation = await guestDataService.getConversation(id, user.id);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }
    
    const messageId = await guestDataService.addMessage(id, {
      role,
      content,
      agentConfig,
      toolCalls,
      processingTime: req.body.processingTime,
      tokenCount: req.body.tokenCount
    });
    
    // Update guest activity
    await guestDataService.updateGuestActivity(req.user.guestSession, {
      userAgent: req.get('User-Agent')
    });
    
    res.status(201).json({
      id: messageId,
      conversation_id: id,
      role,
      content,
      timestamp: Math.floor(Date.now() / 1000),
      agentConfig,
      toolCalls
    });
  } else {
    // Authenticated users: Add message to PostgreSQL
    // Verify conversation exists and belongs to user
    const conversationResult = await neonDB.query(`
      SELECT id FROM conversations WHERE id = $1 AND user_id = $2
    `, [id, req.user.id]);
    
    if (conversationResult.rowCount === 0) {
      throw new NotFoundError('Conversation not found');
    }
    
    // Insert the message
    const messageResult = await neonDB.query(`
      INSERT INTO messages (conversation_id, role, content, agent_config, tool_calls, processing_time, token_count, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      RETURNING id, conversation_id, role, content, agent_config, tool_calls, processing_time, token_count, created_at
    `, [
      id,
      role,
      content,
      JSON.stringify(agentConfig),
      JSON.stringify(toolCalls),
      req.body.processingTime || null,
      req.body.tokenCount || null
    ]);
    
    const message = messageResult.rows[0];
    
    // Update conversation's updated_at timestamp
    await neonDB.query(`
      UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1
    `, [id]);
    
    res.status(201).json({
      id: message.id,
      conversation_id: message.conversation_id,
      role: message.role,
      content: message.content,
      agentConfig: typeof message.agent_config === 'string' ? JSON.parse(message.agent_config) : message.agent_config,
      toolCalls: typeof message.tool_calls === 'string' ? JSON.parse(message.tool_calls) : message.tool_calls,
      processingTime: message.processing_time,
      tokenCount: message.token_count,
      timestamp: Math.floor(new Date(message.created_at).getTime() / 1000)
    });
  }
}));

/**
 * PUT /api/v1/conversations/:id
 * Update conversation (title, metadata)
 */
router.put('/:id', requireGuestPermission('conversations:create'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, metadata } = req.body;
  
  if (req.user.isGuest) {
    const user = await guestDataService.getGuestUser(req.user.guestSession);
    if (!user) {
      return res.status(404).json({ error: 'Guest user not found' });
    }
    
    const conversation = await guestDataService.getConversation(id, user.id);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }
    
    // Update conversation in SQLite
    await guestDataService.db.run(`
      UPDATE guest_conversations 
      SET title = COALESCE(?, title), 
          metadata = COALESCE(?, metadata),
          updated_at = ?
      WHERE id = ? AND user_id = ?
    `, [
      title,
      metadata ? JSON.stringify(metadata) : null,
      Math.floor(Date.now() / 1000),
      id,
      user.id
    ]);
    
    const updatedConversation = await guestDataService.getConversation(id, user.id);
    res.json(updatedConversation);
  } else {
    // Authenticated users: Update conversation in PostgreSQL
    // Verify conversation exists and belongs to user
    const conversationResult = await neonDB.query(`
      SELECT id FROM conversations WHERE id = $1 AND user_id = $2
    `, [id, req.user.id]);
    
    if (conversationResult.rowCount === 0) {
      throw new NotFoundError('Conversation not found');
    }
    
    // Update conversation
    const updateResult = await neonDB.query(`
      UPDATE conversations 
      SET title = COALESCE($1, title),
          metadata = COALESCE($2, metadata),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND user_id = $4
      RETURNING id, user_id, title, agent_type, metadata, created_at, updated_at
    `, [
      title || null,
      metadata ? JSON.stringify(metadata) : null,
      id,
      req.user.id
    ]);
    
    const updatedConversation = updateResult.rows[0];
    
    res.json({
      id: updatedConversation.id,
      user_id: updatedConversation.user_id,
      title: updatedConversation.title,
      agentType: updatedConversation.agent_type,
      metadata: typeof updatedConversation.metadata === 'string' ? JSON.parse(updatedConversation.metadata) : updatedConversation.metadata,
      created_at: Math.floor(new Date(updatedConversation.created_at).getTime() / 1000),
      updated_at: Math.floor(new Date(updatedConversation.updated_at).getTime() / 1000)
    });
  }
}));

/**
 * DELETE /api/v1/conversations/:id
 * Delete conversation and all its messages
 */
router.delete('/:id', requireGuestPermission('conversations:create'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  if (req.user.isGuest) {
    const user = await guestDataService.getGuestUser(req.user.guestSession);
    if (!user) {
      return res.status(404).json({ error: 'Guest user not found' });
    }
    
    const conversation = await guestDataService.getConversation(id, user.id);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }
    
    // Delete messages and conversation (CASCADE will handle messages)
    await guestDataService.db.run(`
      DELETE FROM guest_conversations 
      WHERE id = ? AND user_id = ?
    `, [id, user.id]);
    
    res.status(204).send();
  } else {
    // Authenticated users: Delete conversation from PostgreSQL
    // Verify conversation exists and belongs to user
    const conversationResult = await neonDB.query(`
      SELECT id FROM conversations WHERE id = $1 AND user_id = $2
    `, [id, req.user.id]);
    
    if (conversationResult.rowCount === 0) {
      throw new NotFoundError('Conversation not found');
    }
    
    // Delete conversation (CASCADE will handle messages)
    await neonDB.query(`
      DELETE FROM conversations WHERE id = $1 AND user_id = $2
    `, [id, req.user.id]);
    
    res.status(204).send();
  }
}));

/**
 * GET /api/v1/conversations/:id/export
 * Export conversation for migration
 */
router.get('/:id/export', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  let conversation, messages;
  
  if (req.user.isGuest) {
    // Guest users: Export from SQLite
    conversation = await guestDataService.getConversation(id, req.user.id);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }
    messages = await guestDataService.getConversationMessages(id);
  } else {
    // Authenticated users: Export from PostgreSQL
    const conversationResult = await neonDB.query(`
      SELECT 
        id, user_id, title, agent_type, metadata, created_at, updated_at
      FROM conversations 
      WHERE id = $1 AND user_id = $2
    `, [id, req.user.id]);
    
    if (conversationResult.rowCount === 0) {
      throw new NotFoundError('Conversation not found');
    }
    
    conversation = conversationResult.rows[0];
    
    // Get messages for the conversation
    const messagesResult = await neonDB.query(`
      SELECT 
        id, conversation_id, role, content, agent_config, tool_calls, 
        processing_time, token_count, created_at
      FROM messages 
      WHERE conversation_id = $1 
      ORDER BY created_at ASC
    `, [id]);
    
    messages = messagesResult.rows;
  }
  
  res.json({
    conversation,
    messages,
    exportTimestamp: Math.floor(Date.now() / 1000)
  });
}));

module.exports = router;